import { Injectable } from '@nestjs/common';
import { LanguageServiceClient } from '@google-cloud/language';

@Injectable()
export class SeoService {
  private readonly client: LanguageServiceClient;

  constructor() {
    // Automatically uses GOOGLE_APPLICATION_CREDENTIALS
    this.client = new LanguageServiceClient();
  }

  async analyzeKeywords(selectedAngle: string): Promise<any> {
    const [result] = await this.client.analyzeEntities({
      document: {
        content: selectedAngle, // Using the selected content angle as input
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

    // Ensure the selected angle is included in primary keywords
    let primaryKeywords = keywords.filter((keyword) => keyword.salience > 0.5);
    const secondaryKeywords = keywords.filter(
      (keyword) => keyword.salience <= 0.5,
    );

    // Prioritize longer phrases if possible
    const meaningfulKeywords = keywords.filter(
      (k) => k.name.split(' ').length > 2,
    );

    // Ensure the selected angle is included in primary keywords
    if (
      !primaryKeywords.some(
        (k) => k.name.toLowerCase() === selectedAngle.toLowerCase(),
      )
    ) {
      primaryKeywords.unshift({
        name: selectedAngle,
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
