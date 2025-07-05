import { Document } from '@langchain/core/documents';

export const formatDocumentsAsString = (documents: Document[]): string => {
  /**
   * Sample doc:
   *
   * {
   *   "pageContent": "Korean fried chicken\nPrep:15 mins\nCook:15 mins\nMore effortServes 4\nIngredients\nFor the chicken\n500g chicken wings\nlarge chunk of ginger, finely grated\n50g cornflour\nvegetable oil, for frying\nsesame seeds and sliced spring onion, to serve\nFor the sauce\n6 tbsp dark brown sugar\n2 tbsp gochujang (Korean chilli paste)\n2 tbsp soy sauce\n2 large garlic cloves, crushed\nsmall piece ginger, grated\n2 tsp sesame oil\nMethod\nStep 1\nTo make the sauce, put all the ingredients in a saucepan and",
   *   "metadata": {
   *     "source": "langchain-playground/data/langgraph/recipe-korean-fried-chicken.pdf",
   *     "pdf": {
   *       "version": "1.10.100",
   *       "info": {
   *         "PDFFormatVersion": "1.4",
   *         "IsAcroFormPresent": false,
   *         "IsXFAPresent": false,
   *         "Title": "Korean fried chicken recipe | Good Food",
   *         "Creator": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
   *         "Producer": "Skia/PDF m124",
   *         "CreationDate": "D:20240503143217+00'00'",
   *         "ModDate": "D:20240503143217+00'00'"
   *       },
   *       "metadata": null,
   *       "totalPages": 2
   *     },
   *     "loc": {
   *       "lines": {
   *         "from": 1,
   *         "to": 21
   *       }
   *     },
   *     "doc_id": "e6c7af21-45b1-45df-a0d9-8c9c07bbb5b6"
   *   },
   *   "id": "01e9a149-1dd6-4d53-94d1-7cf79b7dc0fe"
   * }
   */

  return documents
    .map((doc, _index) => {
      return `Source: ${doc.metadata?.source || 'Unknown'}
  - Content: ${doc.pageContent}
  - Lines: ${doc.metadata?.loc?.lines ? `${doc.metadata.loc.lines.from}-${doc.metadata.loc.lines.to}` : 'N/A'}
`;
    })
    .join('\n');
};
