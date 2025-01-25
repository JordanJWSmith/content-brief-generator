import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class CompetitorAnalysisService {
  private readonly apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  private readonly cx = process.env.GOOGLE_SEARCH_ENGINE_ID;
  private readonly logger = new Logger(CompetitorAnalysisService.name);

  async fetchCompetitorData(keyword: string): Promise<any> {
    const url = `https://www.googleapis.com/customsearch/v1`;

    try {
      const { data } = await axios.get(url, {
        params: {
          key: this.apiKey,
          cx: this.cx,
          q: keyword,
        },
      });

      // Extract relevant details from search results
      const results = data.items.map(item => ({
        title: item.title,
        link: item.link,
        snippet: item.snippet,
      }));

      return results;
    } catch (error) {
      // Handle errors appropriately
      this.logger.error('Error fetching competitor data:', error.response?.data || error.message);
      throw new Error('Failed to fetch competitor data');
    }
  }
}
