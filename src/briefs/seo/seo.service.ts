import { Injectable } from '@nestjs/common';
import { LanguageServiceClient } from '@google-cloud/language';

@Injectable()
export class SeoService {
  private readonly client: LanguageServiceClient;

  constructor() {
    // Automatically uses GOOGLE_APPLICATION_CREDENTIALS
    this.client = new LanguageServiceClient();
  }

  async analyzeKeywords(content: string): Promise<any> {
    const [result] = await this.client.analyzeEntities({
      document: {
        content,
        type: 'PLAIN_TEXT',
      },
    });
  
    // Process and refine the keywords
    const keywords = result.entities
      .filter(entity => entity.salience > 0.1) // Exclude low-relevance keywords
      .map(entity => ({
        name: entity.name,
        type: entity.type, // ENTITY_TYPE like PERSON, LOCATION, ORGANIZATION, etc.
        salience: parseFloat(entity.salience.toFixed(2)), // Round salience
      }));
  
    // Categorize primary and secondary keywords
    return {
      primaryKeywords: keywords.filter(keyword => keyword.salience > 0.5),
      secondaryKeywords: keywords.filter(keyword => keyword.salience <= 0.5),
    };
  }
}
