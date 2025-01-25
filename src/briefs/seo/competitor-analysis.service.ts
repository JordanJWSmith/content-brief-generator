import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';

@Injectable()
export class CompetitorAnalysisService {
  private readonly apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  private readonly cx = process.env.GOOGLE_SEARCH_ENGINE_ID;
  private readonly logger = new Logger(CompetitorAnalysisService.name); 

  async fetchCompetitorData(keyword: string): Promise<any> {
    const url = `https://www.googleapis.com/customsearch/v1`;
  
    try {
      // Fetch search results
      const { data } = await axios.get(url, {
        params: {
          key: this.apiKey,
          cx: this.cx,
          q: keyword,
        },
      });
  
      // Apply filtering to the search results
      const filteredResults = this.filterResults(data.items);
  
      // Scrape competitor pages for more insights
      const competitors = await Promise.all(
        filteredResults.map(async item => {
          const pageDetails = await this.scrapePage(item.link);
          return {
            title: item.title,
            link: item.link,
            snippet: item.snippet,
            ...pageDetails,
          };
        }),
      );
  
      return competitors;
    } catch (error) {
      this.logger.error('Error fetching competitor data:', error.response?.data || error.message);
      throw new Error('Failed to fetch competitor data');
    }
  }

  private async scrapePage(url: string): Promise<any> {
    try {
      // Fetch the page content
      const { data } = await axios.get(url);
      const $ = cheerio.load(data);

      // Extract headings (H1, H2, H3)
      const headings = [];
      $('h1, h2, h3').each((_, element) => {
        headings.push($(element).text().trim());
      });

      // Calculate word count
      const wordCount = $('body')
        .text()
        .split(/\s+/)
        .length;

      return { headings, wordCount };
    } catch (error) {
      console.error(`Error scraping ${url}:`, error.message);
      return { headings: [], wordCount: 0 }; // Return empty data on failure
    }
  }

  private identifyContentGaps(
    userKeywords: string[],
    competitors: any[],
  ): string[] {
    const allHeadings = competitors.flatMap(c => c.headings);
    const missingTopics = userKeywords.filter(
      keyword => !allHeadings.some(heading => heading.toLowerCase().includes(keyword.toLowerCase())),
    );
    return missingTopics;
  }

  private filterResults(results: any[]): any[] {
    return results.filter(item => {
      const excludedDomains = [
        'careers',         // Exclude job postings
        'about',           // Exclude general Google "about" pages
        'doodles',         // Exclude Google Doodles
        'jobs',            // Exclude job listings
      ];
  
      // Check if the link contains excluded domains
      const isExcluded = excludedDomains.some(domain => item.link.includes(domain));
  
      // Optionally filter based on content
      const isSnippetRelevant = item.snippet && item.snippet.length > 50;
  
      return !isExcluded && isSnippetRelevant; // Include only relevant results
    });
  }
  
}
