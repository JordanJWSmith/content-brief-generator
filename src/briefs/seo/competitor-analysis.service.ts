import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import OpenAI from 'openai';
import * as kmeansModule from 'ml-kmeans';
// import cluster from 'cluster';
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

  async fetchCompetitorData(
    topic: string,
    focus: string,
    goal: string,
    tone: string,
  ): Promise<any> {
    try {
      const url = `https://www.googleapis.com/customsearch/v1`;
      // 🔹 Build a richer search query to retrieve **relevant** competitor content
      const searchQuery = `${topic} ${focus} articles UK`;

      // Fetch search results
      const { data } = await axios.get(url, {
        params: {
          key: this.apiKey,
          cx: this.cx,
          q: searchQuery,
          excludeTerms: 'department, academic, university',
          gl: 'uk',
          cr: 'countryUK',
          dateRestrict: 'd1m',
          sort: 'date',
        },
      });

      const filteredResults = this.filterResults(data.items);

      // Scrape headings and retry for failed results
      const competitors = await this.scrapeCompetitorPages(filteredResults);

      this.logger.verbose('Finished scraping competitors');
      this.logger.verbose('Generating content angles...');

      // Detect content gaps and cluster them into topic areas **aligned with focus & goal**
      const contentAngles = await this.suggestContentAngles(
        topic,
        focus,
        goal,
        tone,
        competitors,
      );

      this.logger.verbose('Finished suggesting content angles');

      return { competitors, contentAngles };
    } catch (error) {
      this.logger.error('Error fetching competitor data:', error.message);
      throw new Error('Failed to fetch competitor data');
    }
  }

  private async suggestContentAngles(
    topic: string,
    focus: string,
    goal: string,
    tone: string,
    competitors: any[],
  ): Promise<string[]> {
    const allHeadings = competitors.flatMap((c) => c.headings);

    // Step 1: Clean and deduplicate headings
    const cleanedHeadings = await this.cleanHeadings(allHeadings, topic);
    this.logger.verbose(`Finished cleaning headings`);

    // Step 2: Generate embeddings for all headings
    const headingEmbeddings =
      await this.generateEmbeddingsInBatches(cleanedHeadings);
    this.logger.verbose(`Finished generating heading embeddings`);

    // Step 3: Identify content gaps (filtering duplicates)
    const initialGaps = await this.identifyTrueContentGaps(
      cleanedHeadings,
      headingEmbeddings,
      competitors,
    );
    this.logger.verbose(`Identified content gaps`);

    // Step 4: Cluster content gaps into **topic areas relevant to the user focus & goal**
    const clusters = this.performClustering(
      initialGaps.headings,
      initialGaps.embeddings,
    );
    this.logger.verbose(`Performed clustering`);

    // Step 5: Generate AI-driven content angles **tailored to focus & goal**
    // const namedAngles = await this.nameClusters(clusters, focus, goal, tone);
    const namedAngles = await this.nameClustersGpt4(
      clusters,
      focus,
      goal,
      tone,
    );

    return namedAngles;

    // return namedAngles.map((angle) => angle.name);
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
      /social/i,
      /related/i,
      /navigation/i,
      /links/i,
      /recommended/i,
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
    const numClusters = Math.min(headings.length, 5); // Ensure we return a few well-defined angles
    const { clusters } = kmeansModule.kmeans(embeddings, numClusters, {});

    const clusterMap: { [key: number]: string[] } = {};
    clusters.forEach((clusterIndex, i) => {
      if (!clusterMap[clusterIndex]) {
        clusterMap[clusterIndex] = [];
      }
      clusterMap[clusterIndex].push(headings[i]);
    });

    return Object.values(clusterMap).map((clusterHeadings, index) => ({
      name: `Cluster ${index + 1}`, // Temporary name (to be replaced)
      headings: clusterHeadings,
    }));
  }

  private async nameClustersGpt4(
    clusters: { name: string; headings: string[] }[],
    focus: string,
    goal: string,
    tone: string,
  ): Promise<any> {
    this.logger.log(`clusterInput: ${clusters}`);
    const clusterSummaries = clusters.map(
      (c, index) => `${index + 1}. ${c.headings.slice(0, 5).join(', ')}`,
    );
    this.logger.log(`clusterSummaries: ${clusterSummaries}`);
    const prompt = `
      You are an expert content strategist. The user wants to write about **"${focus}"** with the goal of **"${goal}"** with the tone **"${tone}"**.
      
      You will be provided a set of topics extracted from competitor analysis.
      📌 **Task:** Generate diverse content angles based on competitor research.
      
      📝 **Your Task:**
      1. Assign **one unique content angle** to each topic.
      2. Ensure that **NO TWO angles use the same framing**.
      3. Choose from the following perspectives:
        - **Personal & Survivor Stories**
        - **Policy & Government Actions**
        - **Advocacy & Awareness Movements**
        - **Media & Cultural Influence**
        - **Historical & Global Comparisons**
      4. Each angle should be **specific and engaging**.
      5. **Avoid generic titles**—be as **distinctive as possible**.
      
      🔹 **Now generate content angles for the topics above. Each one should use a DIFFERENT perspective.**
      Provide your output as an array in the following JSON format:
      {
        "angles" : [
          {
            "angle": "...",
            "chosenPerspective": "..."
          },
          {
            ...
          }
        ]
      }
    `;
    const clusterResponse = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'developer', content: prompt },
        {
          role: 'user',
          content: `${JSON.stringify(clusterSummaries)}`,
        },
      ],
      response_format: {
        type: 'json_object',
      },
    });
    const clusterObj = this.parseOpenAiOutput(clusterResponse);
    this.logger.log(`clusterObj: ${JSON.stringify(clusterObj)}`);

    // const namedClusters = clusters.map((cluster, index) => ({
    //   name: clusterObj.angles[index]?.angle || `Cluster ${index + 1}`, // Use the generated angle, fallback if missing
    //   perspective: clusterObj.angles[index]?.chosenPerspective || 'General', // Include the chosen perspective
    //   headings: cluster.headings, // Retain the original headings
    // }));

    return clusterObj;
  }

  private parseOpenAiOutput(
    responseObject: Record<string, any>,
  ): Record<string, any> {
    const rawContent = responseObject.choices[0].message.content;
    let sanitized = rawContent.trim();
    // If the entire string is wrapped in quotes, remove them.
    if (sanitized.startsWith('"') && sanitized.endsWith('"')) {
      sanitized = sanitized.slice(1, -1);
    }
    // Replace literal newline characters with the escaped newline sequence.
    sanitized = sanitized.replace(/\r?\n/g, '');
    // Remove any trailing commas before a closing brace or bracket.
    sanitized = sanitized.replace(/,\s*([}\]])/g, '$1');
    // Replace double backslashes (\\) with a single backslash (\)
    // This is useful if the string is double-encoded.
    sanitized = sanitized.replace(/\\\\/g, '');
    this.logger.log(`attempting to parse: ${JSON.stringify(sanitized)}`);

    return JSON.parse(sanitized);
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
        'gov.scot',
        'gov',
        'police.uk',
        'parliament.uk',
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

  private async scrapePage(url: string, retries = 1): Promise<any> {
    try {
      this.logger.log(`Scraping ${url}`);
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
