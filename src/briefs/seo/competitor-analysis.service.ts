import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import OpenAI from "openai";
import * as kmeansModule from 'ml-kmeans';
import { normalize } from 'path';

@Injectable()
export class CompetitorAnalysisService {
  private readonly apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  private readonly cx = process.env.GOOGLE_SEARCH_ENGINE_ID;
  private readonly logger = new Logger(CompetitorAnalysisService.name);
  private readonly openai: OpenAI;

  private pendingEmbeddings = new Map<string, Promise<number[]>>();
  private embeddingCache = new Map<string, number[]>();

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    if (!this.openai.apiKey) {
      throw new Error("Missing OpenAI API key. Please check your .env file.");
    }
  }

//   async fetchCompetitorData(keyword: string): Promise<any> {
//     try {
//       const url = `https://www.googleapis.com/customsearch/v1`;

//       // Fetch competitor data
//       const { data } = await axios.get(url, {
//         params: { key: this.apiKey, cx: this.cx, q: keyword },
//       });
//       const filteredResults = this.filterResults(data.items);

//       // Scrape headings from competitor pages
//       const competitors = await Promise.all(
//         filteredResults.map(async (item) => {
//           const pageDetails = await this.scrapePage(item.link);
//           return {
//             title: item.title,
//             link: item.link,
//             snippet: item.snippet,
//             ...pageDetails,
//           };
//         })
//       );

//       // Detect content gaps
//       const contentGaps = await this.detectContentGaps(keyword, competitors);

//       return { competitors, contentGaps };
//     } catch (error) {
//       this.logger.error('Error fetching competitor data:', error.message);
//       throw new Error('Failed to fetch competitor data');
//     }
//   }

async fetchCompetitorData(keyword: string): Promise<any> {
    try {
      const url = `https://www.googleapis.com/customsearch/v1`;
  
      // Fetch search results
      const { data } = await axios.get(url, {
        params: { key: this.apiKey, cx: this.cx, q: keyword },
      });
  
      const filteredResults = this.filterResults(data.items);
  
      // Scrape headings and retry for failed results
      const competitors = await this.scrapeCompetitorPages(filteredResults);
  
      // Detect content gaps
      const contentGaps = await this.detectContentGaps(keyword, competitors);
  
      return { competitors, contentGaps };
    } catch (error) {
      this.logger.error('Error fetching competitor data:', error.message);
      throw new Error('Failed to fetch competitor data');
    }
  }

  private async detectContentGaps(keyword: string, competitors: any[]): Promise<any> {
    const allHeadings = competitors.flatMap((c) => c.headings);

    // Clean and deduplicate headings
    const cleanedHeadings = await this.cleanHeadings(allHeadings, keyword);

    // Generate embeddings for all headings
    const keywordEmbedding = await this.createEmbedding(keyword);
    const headingEmbeddings = await this.generateEmbeddingsInBatches(cleanedHeadings);

    // Filter headings by relevance (higher threshold for precision)
    const relevantHeadings = cleanedHeadings.filter((_, index) => {
      const similarity = this.calculateCosineSimilarity(keywordEmbedding, headingEmbeddings[index]);
      return similarity >= 0.8; // Raised threshold
    });

    // Cluster the content gaps
    const clusters = this.performClustering(relevantHeadings, headingEmbeddings);

    // Name the clusters dynamically
    const namedClusters = await this.nameClusters(clusters);

    // Generate actionable insights
    const actionableInsights = this.generateClusterInsights(namedClusters);

    return actionableInsights;
  }

  private async cleanHeadings(headings: string[], keyword: string): Promise<string[]> {
    const irrelevantPatterns = [
      /log in/i,
      /sign up/i,
      /privacy/i,
      /reset password/i,
      /subscribe/i,
      /navigation/i,
      /community guidelines/i,
      /video/i,
      /publications/i,
      /most viewed/i,
      /related/i,
      /^\s*$/, // Empty strings
    ];

    // Filter out irrelevant patterns
    const filteredHeadings = headings.filter((heading) => {
      return !irrelevantPatterns.some((pattern) => pattern.test(heading));
    });

    // Remove headings with fewer than 3 meaningful words
    const meaningfulHeadings = filteredHeadings.filter((heading) => {
      const words = heading.split(/\s+/).filter((word) => word.length > 2); // Remove short/insignificant words
      return words.length >= 3;
    });

    // Use NLP-based checks for topic relevance
    const relevanceScores = await Promise.all(
      meaningfulHeadings.map((heading) => this.calculateHeadingRelevance(keyword, heading))
    );

    // Filter by relevance threshold (higher precision)
    const relevantHeadings = meaningfulHeadings.filter((_, index) => relevanceScores[index] >= 0.8);

    // Deduplicate and return
    return Array.from(new Set(relevantHeadings));
  }

  private async calculateHeadingRelevance(keyword: string, heading: string): Promise<number> {
    try {
      const keywordEmbedding = await this.createEmbedding(keyword);
      const headingEmbedding = await this.createEmbedding(heading);
      return this.calculateCosineSimilarity(keywordEmbedding, headingEmbedding);
    } catch (error) {
      this.logger.error(`Error calculating relevance for heading: "${heading}"`, error.message);
      return 0; // Treat errors as low relevance
    }
  }

  private performClustering(headings: string[], embeddings: number[][]): { name: string; headings: string[] }[] {
    const numClusters = Math.min(headings.length, 5);
    const { clusters } = kmeansModule.kmeans(embeddings, numClusters, {});
    this.logger.log(`Clusters: ${JSON.stringify(clusters)}`);

    const clusterMap: { [key: number]: string[] } = {};
    clusters.forEach((clusterIndex, i) => {
      if (!clusterMap[clusterIndex]) {
        clusterMap[clusterIndex] = [];
      }
      clusterMap[clusterIndex].push(headings[i]);
    });

    return Object.values(clusterMap).map((clusterHeadings, index) => ({
      name: `Cluster ${index + 1}`,
      headings: clusterHeadings,
    }));
  }

  private async nameClusters(clusters: { name: string; headings: string[] }[]): Promise<any[]> {
    return await Promise.all(
      clusters.map(async (cluster) => {
        const clusterSummary = cluster.headings.slice(0, 5).join(", ");
        try {
          const response = await this.openai.completions.create({
            model: "gpt-3.5-turbo-instruct",
            prompt: `The following headings are grouped together based on semantic similarity:\n\n${clusterSummary}\n\nProvide a concise label summarizing this group:`,
            max_tokens: 10,
          });

          return {
            name: response.choices[0].text.trim() || `Cluster ${clusters.indexOf(cluster) + 1}`,
            headings: cluster.headings,
          };
        } catch (error) {
          this.logger.error('Error naming cluster:', error.message);
          return {
            name: `Cluster ${clusters.indexOf(cluster) + 1}`,
            headings: cluster.headings,
          };
        }
      })
    );
  }

  private generateClusterInsights(namedClusters: any[]): any {
    return namedClusters.map((cluster) => ({
      category: cluster.name,
      suggestions: cluster.headings.map(
        (heading) => `Consider creating content on "${heading}" in the context of "${cluster.name}".`
      ),
    }));
  }

  private calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a ** 2, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b ** 2, 0));

    return dotProduct / (magnitudeA * magnitudeB);
  }

  async createEmbedding(input: string): Promise<number[]> {
    const normalizedInput = input.trim().toLowerCase();

    

    if (this.pendingEmbeddings.has(normalizedInput)) {
        this.logger.log(`Reusing in-progress embedding for: ${normalizedInput}`);
        return this.pendingEmbeddings.get(normalizedInput);
    }

    if (this.embeddingCache.has(normalizedInput)) {
        this.logger.log(`Reusing cached embedding for: ${normalizedInput}`);
        return this.embeddingCache.get(normalizedInput);
    }

    this.logger.log(`Creating embedding for: ${normalizedInput}`);

    const embeddingPromise = (async () => {
      try {
        const response = await this.openai.embeddings.create({
          model: "text-embedding-ada-002",
          input: normalizedInput,
        });

        const embedding = response.data[0].embedding;
        this.embeddingCache.set(normalizedInput, embedding);

        return embedding;
      } catch (error) {
        this.logger.error(`Error creating embedding for input "${normalizedInput}":`, error.message);
        throw new Error("Failed to create embedding");
      } finally {
        this.pendingEmbeddings.delete(normalizedInput);
      }
    })();

    this.pendingEmbeddings.set(normalizedInput, embeddingPromise);
    return embeddingPromise;
  }

  private async generateEmbeddingsInBatches(inputs: string[], batchSize = 10): Promise<number[][]> {
    const embeddings: number[][] = [];
    const toGenerate: string[] = [];

    inputs.forEach((input) => {
      if (this.embeddingCache.has(input)) {
        embeddings.push(this.embeddingCache.get(input));
      } else {
        toGenerate.push(input);
      }
    });

    const batches = [];
    for (let i = 0; i < toGenerate.length; i += batchSize) {
      batches.push(toGenerate.slice(i, i + batchSize));
    }

    for (const batch of batches) {
      const batchEmbeddings = await Promise.all(batch.map((input: string) => this.createEmbedding(input)));
      embeddings.push(...batchEmbeddings);
    }

    return embeddings;
  }

  private filterResults(results: any[]): any[] {
    return results.filter((item) => {
      const excludedDomains = [
        'careers',
        'about',
        'doodles',
        'jobs',
      ];

      const isExcluded = excludedDomains.some((domain) => item.link.includes(domain));
      const isSnippetRelevant = item.snippet && item.snippet.length > 50;

      return !isExcluded && isSnippetRelevant;
    });
  }

  private async scrapeCompetitorPages(results: any[]): Promise<any[]> {
    const competitors = [];
    const failedUrls = [];
  
    for (const result of results) {
      try {
        const pageDetails = await this.scrapePage(result.link);
  
        if (pageDetails.headings.length > 0 && pageDetails.wordCount > 0) {
          competitors.push({
            title: result.title,
            link: result.link,
            snippet: result.snippet,
            ...pageDetails,
          });
        } else {
          this.logger.warn(`No headings found for ${result.link}`);
          failedUrls.push(result.link);
        }
      } catch (error) {
        this.logger.error(`Error scraping ${result.link}: ${error.message}`);
        failedUrls.push(result.link);
      }
    }
  
    // Replace failed results with alternative articles
    const alternativeResults = results.filter(
      (result) => !competitors.some((comp) => comp.link === result.link)
    );
  
    for (const altResult of alternativeResults) {
      if (competitors.length >= 10) break; // Limit to top 10 competitors
  
      try {
        const pageDetails = await this.scrapePage(altResult.link);
  
        if (pageDetails.headings.length > 0 && pageDetails.wordCount > 0) {
          competitors.push({
            title: altResult.title,
            link: altResult.link,
            snippet: altResult.snippet,
            ...pageDetails,
          });
        }
      } catch (error) {
        this.logger.error(`Error scraping alternative result ${altResult.link}: ${error.message}`);
      }
    }
  
    return competitors;
  }
  

//   private async scrapePage(url: string): Promise<any> {
//     try {
//       const { data } = await axios.get(url);
//       const $ = cheerio.load(data);

//       const headings = [];
//       $('h1, h2, h3').each((_, element) => {
//         headings.push($(element).text().trim());
//       });

//       const wordCount = $('body')
//         .text()
//         .split(/\s+/)
//         .length;

//       return { headings, wordCount };
//     } catch (error) {
//       this.logger.error(`Error scraping ${url}:`, error.message);
//       return { headings: [], wordCount: 0 };
//     }
//   }

private async scrapePage(url: string, retries = 3): Promise<any> {
    try {
      const { data } = await axios.get(url);
      const $ = cheerio.load(data);
  
      const headings = [];
      $('h1, h2, h3').each((_, element) => {
        headings.push($(element).text().trim());
      });
  
      const wordCount = $('body')
        .text()
        .split(/\s+/)
        .length;
  
      return { headings, wordCount };
    } catch (error) {
      if (retries > 0) {
        this.logger.warn(`Retrying scraping for ${url}. Retries left: ${retries - 1}`);
        await new Promise((resolve) => setTimeout(resolve, 1000 * (4 - retries))); // Exponential backoff
        return this.scrapePage(url, retries - 1);
      }
  
      this.logger.error(`Scraping failed for ${url}: ${error.message}`);
      return { headings: [], wordCount: 0 };
    }
  }
  
}
