import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import OpenAI from 'openai';
import * as kmeansModule from 'ml-kmeans';
// import { normalize } from 'path';

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
      throw new Error('Missing OpenAI API key. Please check your .env file.');
    }
  }

  async fetchCompetitorData(keyword: string): Promise<any> {
    try {
      const url = `https://www.googleapis.com/customsearch/v1`;

      // TODO: take location and date as input params
      // Fetch search results
      const { data } = await axios.get(url, {
        params: {
          key: this.apiKey,
          cx: this.cx,
          q: `intitle:${keyword}`,
          excludeTerms: 'department, academic, university',
          gl: 'uk',
          cr: 'countryUK',
          dateRestrict: 'd6m',
          sort: 'date',
        },
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

  //   private async detectContentGaps(keyword: string, competitors: any[]): Promise<any> {
  //     const allHeadings = competitors.flatMap((c) => c.headings);

  //     // Clean and deduplicate headings
  //     const cleanedHeadings = await this.cleanHeadings(allHeadings, keyword);

  //     // Generate embeddings for all headings
  //     const keywordEmbedding = await this.createEmbedding(keyword);
  //     const headingEmbeddings = await this.generateEmbeddingsInBatches(cleanedHeadings);

  //     // Filter headings by relevance (higher threshold for precision)
  //     const relevantHeadings = cleanedHeadings.filter((_, index) => {
  //       const similarity = this.calculateCosineSimilarity(keywordEmbedding, headingEmbeddings[index]);
  //       return similarity >= 0.8; // Raised threshold
  //     });

  //     // Cluster the content gaps
  //     const clusters = this.performClustering(relevantHeadings, headingEmbeddings);

  //     // Name the clusters dynamically
  //     const namedClusters = await this.nameClusters(clusters);

  //     // Generate actionable insights
  //     const actionableInsights = this.generateClusterInsights(namedClusters);

  //     return actionableInsights;
  //   }

  private async detectContentGaps(
    keyword: string,
    competitors: any[],
  ): Promise<any> {
    const allHeadings = competitors.flatMap((c) => c.headings);

    // Step 1: Clean and deduplicate headings
    const cleanedHeadings = await this.cleanHeadings(allHeadings, keyword);

    // Step 2: Generate embeddings for all headings and the keyword
    // const keywordEmbedding = await this.createEmbedding(keyword);
    const headingEmbeddings =
      await this.generateEmbeddingsInBatches(cleanedHeadings);

    // Step 3: Identify true content gaps (filtering duplicates)
    const initialGaps = await this.identifyTrueContentGaps(
      cleanedHeadings,
      headingEmbeddings,
      competitors,
    );

    // Step 4: Expand content gap logic (combine concepts for novelty)
    const expandedGaps = await this.expandContentGapLogic(
      initialGaps.headings,
      initialGaps.embeddings,
      // keywordEmbedding,
    );

    // Step 5: Integrate contextual relevance (filter for tone/style diversity)
    const finalGaps = await this.integrateContextualRelevance(
      expandedGaps.headings,
      competitors,
    );

    // Step 6: Perform clustering on the refined content gaps
    const clusters = this.performClustering(
      finalGaps.headings,
      finalGaps.embeddings,
    );

    // Step 7: Name the clusters dynamically
    const namedClusters = await this.nameClusters(clusters);

    // Step 8: Generate actionable insights for each cluster
    const actionableInsights = this.generateClusterInsights(namedClusters);

    return actionableInsights;
  }

  private async identifyTrueContentGaps(
    cleanedHeadings: string[],
    headingEmbeddings: number[][],
    competitors: any[],
  ): Promise<{ headings: string[]; embeddings: number[][] }> {
    const gaps = [];
    const gapEmbeddings = [];

    // Extract all competitor article text for deeper novelty detection
    const competitorContent = competitors
      .flatMap((comp) => comp.fullContent || [])
      .join(' ');

    for (let i = 0; i < cleanedHeadings.length; i++) {
      const heading = cleanedHeadings[i];
      const embedding = headingEmbeddings[i];

      // Check if the heading is already present in competitor headings or content
      const isDuplicate = this.isDuplicateHeading(heading, competitorContent);

      // If not a duplicate, add to gaps
      if (!isDuplicate) {
        gaps.push(heading);
        gapEmbeddings.push(embedding);
      }
    }

    return { headings: gaps, embeddings: gapEmbeddings };
  }

  private isDuplicateHeading(
    heading: string,
    competitorContent: string,
  ): boolean {
    const lowerHeading = heading.toLowerCase();

    // Check for exact or near matches in competitor content
    const isExactMatch = competitorContent.toLowerCase().includes(lowerHeading);

    // Optionally, implement fuzzy matching here for near matches
    // Example: Compare `lowerHeading` against competitor headings or phrases

    return isExactMatch;
  }

  private async expandContentGapLogic(
    gaps: string[],
    embeddings: number[][],
    // keywordEmbedding: number[],
  ): Promise<{ headings: string[]; embeddings: number[][] }> {
    const expandedGaps = [];
    const expandedEmbeddings = [];

    for (let i = 0; i < gaps.length; i++) {
      const gap = gaps[i];
      const embedding = embeddings[i];

      // Expand gap by combining concepts
      const expandedGap = await this.expandGapWithConcepts(
        gap,
        // keywordEmbedding,
      );

      this.logger.log(`Expanded Gap: ${expandedGap}`);

      expandedGaps.push(expandedGap);
      expandedEmbeddings.push(embedding); // Keep the same embedding for simplicity
    }

    return { headings: expandedGaps, embeddings: expandedEmbeddings };
  }

  private async expandGapWithConcepts(
    gap: string,
    // keywordEmbedding: number[],
  ): Promise<string> {
    try {
      const response = await this.openai.completions.create({
        model: 'gpt-3.5-turbo-instruct',
        prompt: `Expand the following content gap by combining it with a related concept or angle. Please provide a complete sentence that fully describes the expanded gap without being cut off.\n\nContent Gap: "${gap}"\n\nExpanded Gap:`,
        max_tokens: 100,
      });

      return response.choices[0].text.trim();
    } catch (error) {
      this.logger.error(`Error expanding gap "${gap}":`, error.message);
      return gap; // Return the original gap if expansion fails
    }
  }

  private async integrateContextualRelevance(
    gaps: string[],
    competitors: any[],
  ): Promise<{ headings: string[]; embeddings: number[][] }> {
    const relevantGaps = [];
    const relevantEmbeddings = [];

    for (const gap of gaps) {
      const gapRelevance = await this.analyzeGapRelevance(gap, competitors);

      // Add gaps with a sufficiently different tone or approach
      if (gapRelevance.isDifferent) {
        relevantGaps.push(gapRelevance.gap);
        relevantEmbeddings.push(await this.createEmbedding(gapRelevance.gap));
      }
    }

    return { headings: relevantGaps, embeddings: relevantEmbeddings };
  }

  private async analyzeGapRelevance(
    gap: string,
    competitors: any[],
  ): Promise<{ gap: string; isDifferent: boolean }> {
    try {
      // Generate a comparative prompt
      const competitorSnippets = competitors
        .flatMap((c) => c.snippet || [])
        .slice(0, 5)
        .join('\n');
      const response = await this.openai.completions.create({
        model: 'gpt-3.5-turbo-instruct',
        prompt: `Analyze the following gap for tone and approach differences compared to these competitor snippets:\n\nCompetitor Snippets:\n${competitorSnippets}\n\nContent Gap: "${gap}"\n\nIs this gap significantly different in tone, style, or approach? Respond with "yes" or "no".`,
        max_tokens: 10,
      });

      const output = response.choices[0].text.trim().toLowerCase();
      const isDifferent = output.includes('yes');

      return { gap, isDifferent };
    } catch (error) {
      this.logger.error(
        `Error analyzing gap relevance for "${gap}":`,
        error.message,
      );
      return { gap, isDifferent: false };
    }
  }

  private async cleanHeadings(
    headings: string[],
    keyword: string,
  ): Promise<string[]> {
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
      /cookies/i,
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
      meaningfulHeadings.map((heading) =>
        this.calculateHeadingRelevance(keyword, heading),
      ),
    );

    // Filter by relevance threshold (higher precision)
    const relevantHeadings = meaningfulHeadings.filter(
      (_, index) => relevanceScores[index] >= 0.8,
    );

    // Deduplicate and return
    return Array.from(new Set(relevantHeadings));
  }

  private async calculateHeadingRelevance(
    keyword: string,
    heading: string,
  ): Promise<number> {
    try {
      const keywordEmbedding = await this.createEmbedding(keyword);
      const headingEmbedding = await this.createEmbedding(heading);
      return this.calculateCosineSimilarity(keywordEmbedding, headingEmbedding);
    } catch (error) {
      this.logger.error(
        `Error calculating relevance for heading: "${heading}"`,
        error.message,
      );
      return 0; // Treat errors as low relevance
    }
  }

  private performClustering(
    headings: string[],
    embeddings: number[][],
  ): { name: string; headings: string[] }[] {
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

  private async nameClusters(
    clusters: { name: string; headings: string[] }[],
  ): Promise<any[]> {
    return await Promise.all(
      clusters.map(async (cluster) => {
        const clusterSummary = cluster.headings.slice(0, 5).join(', ');
        try {
          const response = await this.openai.completions.create({
            model: 'gpt-3.5-turbo-instruct',
            prompt: `The following headings are grouped together based on semantic similarity:\n\n${clusterSummary}\n\nProvide a very, very concise label summarizing this group:`,
            max_tokens: 20,
          });

          const name = response.choices[0].text.trim();
          if (!name || name.length === 0) {
            throw new Error('AI response is empty.');
          }

          return {
            name,
            headings: cluster.headings,
          };
        } catch (error) {
          this.logger.error('Error naming cluster:', error.message);
          return {
            name: `Cluster ${clusters.indexOf(cluster) + 1}`,
            headings: cluster.headings,
          };
        }
      }),
    );
  }

  private generateClusterInsights(namedClusters: any[]): any {
    // Return structured data: category name and associated headings
    return namedClusters.map((cluster) => ({
      category: cluster.name,
      headings: cluster.headings, // Return raw headings directly
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
          model: 'text-embedding-ada-002',
          input: normalizedInput,
        });

        const embedding = response.data[0].embedding;
        this.embeddingCache.set(normalizedInput, embedding);

        return embedding;
      } catch (error) {
        this.logger.error(
          `Error creating embedding for input "${normalizedInput}":`,
          error.message,
        );
        throw new Error('Failed to create embedding');
      } finally {
        this.pendingEmbeddings.delete(normalizedInput);
      }
    })();

    this.pendingEmbeddings.set(normalizedInput, embeddingPromise);
    return embeddingPromise;
  }

  private async generateEmbeddingsInBatches(
    inputs: string[],
    batchSize = 10,
  ): Promise<number[][]> {
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
      const batchEmbeddings = await Promise.all(
        batch.map((input: string) => this.createEmbedding(input)),
      );
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
        '.gov.uk',
        'eventbrite.co.uk',
        // 'gov.scot',
        // 'gov',
      ];

      const isExcluded = excludedDomains.some((domain) =>
        item.link.includes(domain),
      );
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
      (result) => !competitors.some((comp) => comp.link === result.link),
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
        this.logger.error(
          `Error scraping alternative result ${altResult.link}: ${error.message}`,
        );
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

  private async scrapePage(url: string, retries = 1): Promise<any> {
    try {
      const { data } = await axios.get(url);
      const $ = cheerio.load(data);

      const headings = [];
      $('h1, h2, h3').each((_, element) => {
        headings.push($(element).text().trim());
      });

      const wordCount = $('body').text().split(/\s+/).length;

      return { headings, wordCount };
    } catch (error) {
      if (retries > 0) {
        this.logger.warn(
          `Retrying scraping for ${url}. Retries left: ${retries - 1}`,
        );
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * (4 - retries)),
        ); // Exponential backoff
        return this.scrapePage(url, retries - 1);
      }

      this.logger.error(`Scraping failed for ${url}: ${error.message}`);
      return { headings: [], wordCount: 0 };
    }
  }
}
