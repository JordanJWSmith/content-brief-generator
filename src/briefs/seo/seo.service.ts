import { Injectable } from '@nestjs/common';
import { LanguageServiceClient } from '@google-cloud/language';

@Injectable()
export class SeoService {
  private readonly client: LanguageServiceClient;

  constructor() {
    // Automatically uses GOOGLE_APPLICATION_CREDENTIALS
    this.client = new LanguageServiceClient();
  }

  async analyzeKeywords(content: string, userKeyword: string): Promise<any> {
    const [result] = await this.client.analyzeEntities({
      document: {
        content,
        type: 'PLAIN_TEXT',
      },
    });

    // Process and refine the keywords
    const keywords = result.entities
      .filter((entity) => entity.salience > 0.1) // Exclude low-relevance keywords
      .map((entity) => ({
        name: entity.name.trim(),
        type: entity.type, // ENTITY_TYPE like PERSON, LOCATION, ORGANIZATION, etc.
        salience: parseFloat(entity.salience.toFixed(2)), // Round salience
      }));

    // Ensure the user keyword is included in primary keywords
    let primaryKeywords = keywords.filter((keyword) => keyword.salience > 0.5);
    const secondaryKeywords = keywords.filter(
      (keyword) => keyword.salience <= 0.5,
    );

    // Prioritize longer phrases if possible
    const meaningfulKeywords = keywords.filter(
      (k) => k.name.split(' ').length > 2,
    );

    // Ensure user-provided keyword is included in primary keywords
    if (
      !primaryKeywords.some(
        (k) => k.name.toLowerCase() === userKeyword.toLowerCase(),
      )
    ) {
      primaryKeywords.unshift({
        name: userKeyword,
        type: 'OTHER',
        salience: 1.0,
      });
    }

    // Prefer a meaningful longer keyword if Google NLP extracted only short ones
    if (meaningfulKeywords.length > 0) {
      primaryKeywords = [meaningfulKeywords[0], ...primaryKeywords];
    }

    return { primaryKeywords, secondaryKeywords };
  }
}
