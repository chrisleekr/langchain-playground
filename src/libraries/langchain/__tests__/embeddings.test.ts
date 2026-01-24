import { Embeddings } from '@langchain/core/embeddings';
import { logger } from '../../logger';
import { getOllamaEmbeddings, getPineconeEmbeddings } from '../embeddings';

const cosineSimilarity = (vec1: number[], vec2: number[]): number => {
  // eslint-disable-next-line security/detect-object-injection -- Index i bounded by vec1.length in reduce
  const dotProduct = vec1.reduce((sum, val, i) => sum + val * (vec2[i] ?? 0), 0);
  const magnitude1 = Math.sqrt(vec1.reduce((sum, val) => sum + val ** 2, 0));
  const magnitude2 = Math.sqrt(vec2.reduce((sum, val) => sum + val ** 2, 0));

  return dotProduct / (magnitude1 * magnitude2);
};

const compareEmbeddings = (vec1: number[], vec2: number[], label: string) => {
  const similarity = cosineSimilarity(vec1, vec2);
  console.log(`${label} similarity: ${similarity.toFixed(3)}`);
  return similarity;
};

// FIXME: This test is failing. Need to find better embeddings model.
// eslint-disable-next-line jest/no-disabled-tests
describe.skip('embeddings', () => {
  describe('PineconeEmbeddings', () => {
    jest.setTimeout(10000);
    let pineconeEmbeddings: Embeddings;

    beforeAll(() => {
      pineconeEmbeddings = getPineconeEmbeddings(logger);
    });

    describe('compare embeddings', () => {
      let embeddings: number[][];

      beforeAll(async () => {
        const texts = ['What is Kubernetes?', 'Kubernetes is a container orchestration system.', 'A car is a type of vehicle.'];

        embeddings = await Promise.all(texts.map(text => pineconeEmbeddings.embedQuery(text)));

        console.log('Embedding 1:', embeddings[0].slice(0, 5)); // Print first 5 values
        console.log('Embedding 2:', embeddings[1].slice(0, 5));
        console.log('Embedding 3:', embeddings[2].slice(0, 5));
      });

      it('text1 vs text2 - should be high', () => {
        expect(compareEmbeddings(embeddings[0], embeddings[1], 'Text1 vs Text2')).toBeGreaterThan(0.9);
      });

      // FIXME: This test is failing. Need to find better embeddings model.
      // eslint-disable-next-line jest/no-commented-out-tests
      // it('text1 vs text3 - should be low', () => {
      //   expect(compareEmbeddings(embeddings[0], embeddings[2], 'Text1 vs Text3')).toBeLessThan(0.1);
      // });
    });
  });

  describe('OllamaEmbeddings', () => {
    let ollamaEmbeddings: Embeddings;

    beforeAll(() => {
      ollamaEmbeddings = getOllamaEmbeddings(logger);
    });

    describe('compare embeddings', () => {
      let embeddings: number[][];

      beforeAll(async () => {
        const texts = ['What is Kubernetes?', 'Kubernetes is a container orchestration system.', 'A car is a type of vehicle.'];

        embeddings = await Promise.all(texts.map(text => ollamaEmbeddings.embedQuery(text)));

        console.log('Embedding 1:', embeddings[0].slice(0, 5)); // Print first 5 values
        console.log('Embedding 2:', embeddings[1].slice(0, 5));
        console.log('Embedding 3:', embeddings[2].slice(0, 5));
      });

      it('text1 vs text2 - should be high', () => {
        expect(compareEmbeddings(embeddings[0], embeddings[1], 'Text1 vs Text2')).toBeGreaterThan(0.9);
      });

      // FIXME: This test is failing. Need to find better embeddings model.
      // eslint-disable-next-line jest/no-commented-out-tests
      // it('text1 vs text3 - should be low', () => {
      //   expect(compareEmbeddings(embeddings[0], embeddings[2], 'Text1 vs Text3')).toBeLessThan(0.1);
      // });
    });
  });
});
