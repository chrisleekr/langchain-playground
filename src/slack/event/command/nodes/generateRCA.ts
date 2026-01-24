import { HumanMessage } from '@langchain/core/messages';
import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import slackifyMarkdown from 'slackify-markdown';
import { logger, removeThinkTag } from '@/libraries';
import { FormattedMessageElement, formatThreadReplies, getThreadRepliesFromText } from '@/libraries/slack/getThreadReplies';
import { OverallStateAnnotation } from '../constants';
import { getChatLLM } from '../../utils';

export const generateRCA = async (allReplies: FormattedMessageElement[]): Promise<string> => {
  // Convert replies to timeline format for analysis

  const model = getChatLLM(logger);

  const timeline = allReplies
    .map(reply => {
      return `[${reply.timestamp}] ${reply.userName}(${reply.user}): ${reply.text} ${reply.images ? `(image: ${reply.images.map(image => image.description).join(', ')})` : ''}`;
    })
    .join('\n');

  const prompt = PromptTemplate.fromTemplate(`
<system>
You are a professional Senior Reliability Engineer. Your task is to summarize the investigation. Your analysis must be **fast**, **logically grounded**, and **strictly based on the provided timeline**

The timeline consists of the following format:
[timestamp] userName(userID): text (if there is an image, then the text is the description of the image)
</system>

### INPUT: Timeline
<timeline>
{timeline}
</timeline>

### OUTPUT FORMAT
- The summary must be 2 – 5 short bullet points, concise, factual, and strictly relevant to the investigation. If there is a root cause or solutions are provided, then you must include them in the summary.
- This will be sent to Slack, so include the userID if necessary in the format "<@userID>".
- It must be concise and to the point by providing a summary of the timeline only relevant information. Do not include any casual chat or unrelated information.
- It must be in markdown format.
- Do not add any extra commentary or explanations.
- If cannot provide any summary, output "Sorry, I cannot provide any summary.".
`);

  const summaryChain = RunnableSequence.from([prompt, model, removeThinkTag]);

  const summaryResult = await summaryChain.invoke({
    timeline
  });

  return summaryResult.content.toString();
};

export const executeImageAnalysis = async (mimeType: string, base64: string): Promise<string> => {
  // Analyze the image
  const model = getChatLLM(logger);

  const message = new HumanMessage({
    content: [
      {
        type: 'text',
        text: 'You are a professional Senior Reliability Engineer.\nAnalyze the image and return a concise, technically grounded description.\nYour analysis must be strictly based on the image.\nAvoid speculation or irrelevant details not visible in the image.\nProvide the description in 2–3 short sentences OR a bullet list of key observations.\nMaintain a professional, objective tone.\nIf cannot provide description, state clearly: "No description available."'
      },
      {
        type: 'image_url',
        image_url: {
          url: `data:${mimeType};base64,${base64}`
        }
      }
    ]
  });

  logger.info({ message }, 'executeImageAnalysis before invoke');
  const response = await model.invoke([message]);

  logger.info({ response }, 'executeImageAnalysis after invoke');

  const description = response.content.toString();

  logger.info({ description }, 'executeImageAnalysis description');
  if (description.includes('No description available.')) {
    return '';
  }

  return description;
};

export const generateRCANode = async (state: typeof OverallStateAnnotation.State): Promise<typeof OverallStateAnnotation.State> => {
  const { command, client } = state;

  logger.info('generateRCANode request');

  const allReplies = await getThreadRepliesFromText(client, command.text);

  logger.info({ allReplies }, 'event command allReplies');

  if (allReplies.length === 0) {
    logger.info('No replies found, do nothing');
    return state;
  }

  const formattedReplies = await formatThreadReplies(client, allReplies);

  // Analyze images
  const formattedRepliesWithImages = await Promise.all(
    formattedReplies.map(async reply => {
      if (reply.images) {
        const imagesWithDescriptions = await Promise.all(
          reply.images.map(async image => {
            if (!image.base64 || !image.mimeType) {
              logger.info({ image }, 'executeImageAnalysis image.base64 or image.mimeType is null');
              return null;
            }
            const description = await executeImageAnalysis(image.mimeType, image.base64);
            return { ...image, description }; // Return new object
          })
        ).then(images => images.filter((image): image is NonNullable<typeof image> => image !== null));

        return { ...reply, images: imagesWithDescriptions }; // Return new object
      }
      return reply;
    })
  );

  state.threadReplies = formattedRepliesWithImages;

  const rca = await generateRCA(formattedRepliesWithImages);

  logger.info({ rca }, 'generateRCANode RCA');

  state.rca = rca;

  // Reply back to the called user's direct message
  try {
    await client.chat.postMessage({
      channel: command.user_id,
      text: `- Summary: \n${slackifyMarkdown(rca)}`
    });
  } catch (error) {
    logger.error({ error }, 'Failed to send RCA summary DM to user');
  }

  return state;
};
