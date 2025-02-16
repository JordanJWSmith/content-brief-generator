import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Brief, BriefDocument } from './schemas/brief.schema';
import { GenerateBriefDto } from './dto/generate-brief.dto';
import { SeoService } from './seo/seo.service';
import { CompetitorAnalysisService } from './seo/competitor-analysis.service';
import OpenAI from 'openai';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class BriefsService {
  private readonly logger = new Logger(BriefsService.name);
  private readonly openai: OpenAI;

  constructor(
    @InjectModel(Brief.name) private readonly briefModel: Model<BriefDocument>,
    private readonly seoService: SeoService,
    private readonly competitorAnalysisService: CompetitorAnalysisService,
  ) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  // async create(generateBriefDto: GenerateBriefDto): Promise<Brief> {
  //   this.logger.log(`generateBriefDto: ${JSON.stringify(generateBriefDto)}`);
  //   return null;
  // }

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

  async generateBrief(generateBriefDto: GenerateBriefDto): Promise<Brief> {
    const {
      userId,
      selectedAngle,
      chosenPerspective,
      focus,
      goal,
      tone,
      competitors,
    } = generateBriefDto;

    // **Step 1: Perform SEO Analysis on the Selected Angle**
    const seoResults = await this.seoService.analyzeKeywords(selectedAngle);

    // **Step 2: Generate Title & Meta Description**
    const titleMetaResponse = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'developer',
          content: `
            Generate a title & meta description for this article angle. 
            Format your response in a JSON object like this: 
            {
              "title": "...",
              "metaDescription": "...",
            }
          `,
        },
        {
          role: 'user',
          content: JSON.stringify({
            selectedAngle,
            chosenPerspective,
            focus,
            goal,
            tone,
            competitorInsights: competitors.map((c) => c.title),
          }),
        },
      ],
      response_format: { type: 'json_object' },
    });
    const titleMetaJson = this.parseOpenAiOutput(titleMetaResponse);

    // **Step 3: Generate Content Structure (H1, H2, H3)**
    const structureResponse = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'developer',
          content: `
            Given this content, generate a structured article outline with H1, H2, and H3 headings.
            Provide the structure in JSON format with keys "h1", "h2", and "h3". For example:
            {
              "h1": "<main title>",
              "h2": ["<subheading1>", "<subheading2>", ...],
              "h3": ["<detail heading1>", "<detail heading2>", ...]
           }
          `,
        },
        {
          role: 'user',
          content: JSON.stringify({
            selectedAngle,
            competitorInsights: competitors,
            competitorHeadings: competitors.flatMap((c) => c.headings),
          }),
        },
      ],
      response_format: { type: 'json_object' },
    });
    const structureJson = this.parseOpenAiOutput(structureResponse);

    // **Step 4: Generate SEO & Writing Style Recommendations**
    const seoResponse = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'developer',
          content: `
            Provide SEO recommendations, key themes, and writing style tips.
            Output your response in a JSON format like this, sticking to the given types:
            {
              seoGuidelines: "...",  // string
              callToActions: [ "...", "..." ],  // array of strings
              writingStyleRecommendations: "..."  // string
            }
          `,
        },
        {
          role: 'user',
          content: JSON.stringify({
            selectedAngle,
            seoResults,
            competitorThemes: competitors.map((c) => c.title),
          }),
        },
      ],
      response_format: { type: 'json_object' },
    });
    const seoJson = this.parseOpenAiOutput(seoResponse);

    // **Step 5: Create Markdown File**
    const markdownContent = `
  # ${titleMetaJson.title}
  
  **Meta Description:** ${titleMetaJson.metaDescription}
  
  ---
  
  ## Content Structure
  
  **H1:** ${structureJson.h1}
  
  **H2:**
  ${structureJson.h2.map((item) => `- ${item}`).join('\n')}
  
  **H3:**
  ${structureJson.h3.map((item) => `- ${item}`).join('\n')}
  
  ---
  
  ## SEO Guidelines & Key Themes
  
  ${seoJson.seoGuidelines}
  
  ---
  
  ## Call To Actions
  
  ${seoJson.callToActions.map((item) => `- ${item}`).join('\n')}
  
  ---
  
  ## Writing Style Recommendations
  
  ${seoJson.writingStyleRecommendations}
  
  ---
  
  ## Competitor Insights
  
  This content is informed by research on top-ranking articles. Here are some key competitor sources used:
  
  ${competitors
    .flatMap((c) => `- [${c.title}](${c.link}) - *${c.snippet}*`)
    .join('\n')}
  
  ---
  
  ## Key Headlines from Competitors
  
  These are major themes appearing in competitor articles:
  
  ${competitors
    .flatMap((c) => c.headings)
    .map((heading) => `- ${heading}`)
    .join('\n')}
    `;

    // Save the Markdown file
    const fileName = `brief_${userId}_${Date.now()}.md`;
    const filePath = path.join(__dirname, '..', 'briefs_output', fileName);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, markdownContent, 'utf8');

    this.logger.log(`Saved MD file at ${filePath}`);

    // Save the brief in MongoDB
    const briefData = {
      userId,
      topic: selectedAngle,
      markdownUrl: filePath,
      generatedAt: new Date(),
    };
    const createdBrief = new this.briefModel(briefData);
    return createdBrief.save();
  }

  //   parseOpenAiOutput(responseObject: Record<string, any>): Record<string, any> {
  //     const rawContent = responseObject.choices[0].message.content;
  //     let sanitized = rawContent.trim();
  //     // If the entire string is wrapped in quotes, remove them.
  //     if (sanitized.startsWith('"') && sanitized.endsWith('"')) {
  //       sanitized = sanitized.slice(1, -1);
  //     }
  //     // Replace literal newline characters with the escaped newline sequence.
  //     sanitized = sanitized.replace(/\r?\n/g, '');
  //     // Remove any trailing commas before a closing brace or bracket.
  //     sanitized = sanitized.replace(/,\s*([}\]])/g, '$1');
  //     // Replace double backslashes (\\) with a single backslash (\)
  //     // This is useful if the string is double-encoded.
  //     sanitized = sanitized.replace(/\\\\/g, '');
  //     this.logger.log(`attempting to parse: ${JSON.stringify(sanitized)}`);

  //     return JSON.parse(sanitized);
  //   }

  //   /**
  //    * Creates a content brief by combining SEO keyword insights and competitor analysis,
  //    * generating the final brief content via OpenAI, and then writing the result to a Markdown file.
  //    * The file path is stored as `markdownUrl` in the database.
  //    */
  //   async create(generateBriefDto: GenerateBriefDto): Promise<Brief> {
  //     const { content, keyword, userId, topic } = generateBriefDto;

  //     // Run SEO analysis and competitor analysis in parallel.
  //     const [seoResults, competitorResults] = await Promise.all([
  //       this.seoService.analyzeKeywords(content, keyword),
  //       this.competitorAnalysisService.fetchCompetitorData(keyword),
  //     ]);

  //     this.logger.log(`seoResults:  ${JSON.stringify(seoResults)}`);
  //     this.logger.log(`competitorResults:  ${JSON.stringify(competitorResults)}`);

  //     // Generate suggested title and meta description.
  //     const titleMetaPrompt = `
  // Based on the following primary keyword and competitor insights, generate a suggested title and meta description for an article.

  // You will receive a JSON object containing a primary keyword and a set of competitor themes. 

  // Provide the output in JSON format:
  // {
  //   "title": "<suggested title>",
  //   "metaDescription": "<suggested meta description>"
  // }
  //     `;

  //     const titlePayload = {
  //       primaryKeyword: seoResults.primaryKeywords.map((k) => k.name).join(', '),
  //       competitorThemes: competitorResults.contentGaps
  //         .map((c) => c.category)
  //         .join(', '),
  //     };

  //     const titleMetaResponse = await this.openai.chat.completions.create({
  //       model: 'gpt-4o-mini',
  //       // prompt: structurePrompt,
  //       messages: [
  //         { role: 'developer', content: titleMetaPrompt },
  //         {
  //           role: 'user',
  //           content: `${JSON.stringify(titlePayload)}`,
  //         },
  //       ],
  //       response_format: {
  //         // See /docs/guides/structured-outputs
  //         type: 'json_object',
  //       },
  //     });

  //     // const titleMetaJson = JSON.parse(titleMetaResponse.choices[0].text.trim());
  //     this.logger.log(
  //       `raw titleMetaResponse: ${JSON.stringify(titleMetaResponse.choices[0].message.content)}`,
  //     );
  //     const titleMetaJson = this.parseOpenAiOutput(titleMetaResponse);

  //     // Generate content structure (H1, H2, H3 headings).
  //     this.logger.log(
  //       `contentGaps: ${JSON.stringify(competitorResults.contentGaps)}`,
  //     );
  //     const structurePrompt = `
  // Based on the following competitor analysis insights, generate a suggested content structure for an article.

  // You will receive a JSON file outlining competitor content gaps and themes. 

  // Provide the structure in JSON format with keys "h1", "h2", and "h3". For example:
  // {
  //   "h1": "<main title>",
  //   "h2": ["<subheading1>", "<subheading2>", ...],
  //   "h3": ["<detail heading1>", "<detail heading2>", ...]
  // }
  //     `;
  //     const structureResponse = await this.openai.chat.completions.create({
  //       model: 'gpt-4o-mini',
  //       // prompt: structurePrompt,
  //       messages: [
  //         { role: 'developer', content: structurePrompt },
  //         {
  //           role: 'user',
  //           content: `${JSON.stringify(competitorResults.contentGaps)}`,
  //         },
  //       ],
  //       response_format: {
  //         // See /docs/guides/structured-outputs
  //         type: 'json_object',
  //       },
  //     });

  //     this.logger.log(
  //       `raw structureResponse: ${JSON.stringify(structureResponse.choices[0].message.content)}`,
  //     );
  //     const structureJson = this.parseOpenAiOutput(structureResponse);

  //     // Generate SEO guidelines, CTAs, and writing style recommendations.
  //     const seoPrompt = `
  // Given the following keywords and competitor insights, generate a set of SEO guidelines, key themes, and recommendations for an article.

  // You will receive a JSON object containing primary keywords, secondary keywords and a set of competitor themes. 

  // Provide the output in JSON format. Be sure to stick to this structure and types:
  // {
  //   "seoGuidelines": "<guidelines and key themes>",  // string
  //   "callToActions": ["<CTA1>", "<CTA2>", ...],  // array
  //   "writingStyleRecommendations": "<recommendations>"  // string
  // }
  //     `;

  //     const seoPayload = {
  //       primaryKeywords: seoResults.primaryKeywords.map((k) => k.name).join(', '),
  //       secondaryKeywords: seoResults.secondaryKeywords
  //         .map((k) => k.name)
  //         .join(', '),
  //       competitorThemes: competitorResults.contentGaps
  //         .map((c) => c.category)
  //         .join(', '),
  //     };

  //     const seoResponse = await this.openai.chat.completions.create({
  //       model: 'gpt-4o-mini',
  //       messages: [
  //         { role: 'developer', content: seoPrompt },
  //         {
  //           role: 'user',
  //           content: `${JSON.stringify(seoPayload)}`,
  //         },
  //       ],
  //       response_format: {
  //         type: 'json_object',
  //       },
  //     });
  //     const seoJson = this.parseOpenAiOutput(seoResponse);

  //     // Assemble the Markdown content.
  //     const markdownContent = `
  // # ${titleMetaJson.title}

  // **Meta Description:** ${titleMetaJson.metaDescription}

  // ---

  // ## Content Structure

  // **H1:** ${structureJson.h1}

  // **H2:**
  // ${Array.isArray(structureJson.h2) ? structureJson.h2.map((item) => `- ${item}`).join('\n') : structureJson.h2}

  // **H3:**
  // ${Array.isArray(structureJson.h3) ? structureJson.h3.map((item) => `- ${item}`).join('\n') : structureJson.h3}

  // ---

  // ## SEO Guidelines & Key Themes

  // ${seoJson.seoGuidelines}

  // ---

  // ## Call To Actions

  // ${Array.isArray(seoJson.callToActions) ? seoJson.callToActions.map((item) => `- ${item}`).join('\n') : seoJson.callToActions}

  // ---

  // ## Writing Style Recommendations

  // ${seoJson.writingStyleRecommendations}

  // ---

  // ## Keywords

  // **Primary Keywords:** ${seoResults.primaryKeywords.map((k) => k.name).join(', ')}

  // **Secondary Keywords:** ${seoResults.secondaryKeywords.map((k) => k.name).join(', ')}

  // ---

  // ## Competitor Insights

  // ${competitorResults.competitors.map((c) => `- [${c.title}](${c.link})`).join('\n')}

  // ---

  // ## Content Gaps

  // ${competitorResults.contentGaps.map((c) => `### ${c.category}\n${c.headings.join('\n')}`).join('\n\n')}
  //     `;

  //     // Write the Markdown content to a file.
  //     // For simplicity, files are stored in a "briefs_output" folder relative to the project root.
  //     const fileName = `brief_${userId}_${Date.now()}.md`;
  //     const filePath = path.join(__dirname, '..', 'briefs_output', fileName);
  //     await fs.mkdir(path.dirname(filePath), { recursive: true });
  //     await fs.writeFile(filePath, markdownContent, 'utf8');
  //     this.logger.log(`Markdown brief created at: ${filePath}`);

  //     // Create the brief document in the database, including the Markdown file URL/path.
  //     // (If you later expose these files via HTTP, adjust this value accordingly.)
  //     const briefData = {
  //       userId,
  //       topic,
  //       outline: Array.isArray(structureJson.h2)
  //         ? structureJson.h2
  //         : [structureJson.h2],
  //       keywords: seoResults.primaryKeywords.map((k) => k.name),
  //       markdownUrl: filePath, // Save the file path; update schema if necessary.
  //       generatedAt: new Date(),
  //       // Optionally include additional fields (title, metaDescription, etc.).
  //     };

  //     const createdBrief = new this.briefModel(briefData);
  //     return createdBrief.save();
  //   }

  async findAll(): Promise<Brief[]> {
    return this.briefModel.find().exec();
  }

  async findByUserId(userId: string): Promise<Brief[]> {
    return this.briefModel.find({ userId }).exec();
  }
}
