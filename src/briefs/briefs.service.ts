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

  parseOpenAiOutput(responseObject: Record<string, any>): Record<string, any> {
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

  /**
   * Creates a content brief by combining SEO keyword insights and competitor analysis,
   * generating the final brief content via OpenAI, and then writing the result to a Markdown file.
   * The file path is stored as `markdownUrl` in the database.
   */
  async create(generateBriefDto: GenerateBriefDto): Promise<Brief> {
    const { content, keyword, userId, topic } = generateBriefDto;

    // const seoResults = {"primaryKeywords":[],"secondaryKeywords":[{"name":"driving force","type":"OTHER","salience":0.49},{"name":"tech","type":"OTHER","salience":0.2}]};
    // const competitorResults = {"competitors":[{"title":"Google becomes the latest tech giant to fall in line with Trump by ...","link":"https://www.the-independent.com/news/world/americas/us-politics/google-ditches-dei-policies-trump-b2693500.html","snippet":"2 days ago ... UK Politics · Health · Business · Money · Science · Space · News Videos. Sports ... government DEI programs and preferencing” in the federal ...","headings":["Stay up to date with notifications from The Independent","Thank you for registering","Google becomes the latest tech giant to fall in line with Trump by ending DEI policies","Google joins Meta and Amazon in rolling back their DEI policies","Sign up for the daily Inside Washington email for exclusive US coverage and analysis sent to your inbox","Get our free Inside Washington email","Get our free Inside Washington email","More about","Join our commenting forum","Most Popular","Popular videos","","Sponsored Features","Thank you for registering"],"wordCount":1828},{"title":"BBC News - The Media Show, Bill Gates on Tech and Politics","link":"https://www.bbc.co.uk/programmes/m00280fp","snippet":"3 days ago ... BBC News except UK & UK HD. Wednesday 01:30. BBC News UK HD & UK only. Show more / Show less. Related Content. Similar programmes. By genre: Factual > Arts ...","headings":["Accessibility links","Bill Gates on Tech and Politics","On TV","More episodes","Previous","Next","Broadcasts","Related Content","Similar programmes","Explore the BBC"],"wordCount":561},{"title":"The Tech Challenge: why UK political parties are struggling - CWE ...","link":"https://stuartthomson.co.uk/the-tech-challenge-why-uk-political-parties-are-struggling/","snippet":"4 days ago ... I had the privilege of hearing Harper Reed speak on his recent visit to London. Reed was President Obamaâ€™s Chief Technology Officer at the last election ...","headings":["The Tech Challenge: why UK political parties are struggling","Post navigation","CWE Communications"],"wordCount":1094},{"title":"Renault Symbioz E-Tech: Imperfect harmony | The Independent","link":"https://www.the-independent.com/life-style/motoring/car-review-b2689947.html","snippet":"8 days ago ... UK · Europe · World · US Politics · UK Politics · Health · Business · Money · Science · Space · News Videos. Sports Sports · Sports · US Sports ...","headings":["Thank you for registering","Renault Symbioz E-Tech: Imperfect harmony","Sean O’Grady finds himself in easy symbiosis with this latest hybrid offering from the reliable French brand","Stay ahead of the curve with our weekly guide to the latest trends, fashion, relationships and more","Stay ahead of the curve with our weekly guide to the latest trends, fashion, relationships and more","Stay ahead of the curve with our weekly guide to the latest trends, fashion, relationships and more","The Spec","Renault Symbioz E-Tech Hybrid Iconic Alpine","More about","Join our commenting forum","Most Popular","Popular videos","","Sponsored Features","Thank you for registering"],"wordCount":1847},{"title":"UK will not be able to resist China's tech dominance - BBC News","link":"https://www.bbc.co.uk/news/articles/c0rq0vyd549o","snippet":"Jan 27, 2025 ... China has not been prominent as the first target of Trump tariffs. There is still an obvious balancing act for the UK government here. But this ...","headings":["UK will not be able to resist China's tech dominance","Related topics","More on this story","Top stories","More to explore","Most read","BBC News Services","Best of BBC iPlayer"],"wordCount":4366},{"title":"Government not equipped to deal with 'big tech' suppliers – report ...","link":"https://www.thinkdigitalpartners.com/news/2025/01/23/government-not-equipped-to-deal-with-big-tech-suppliers-report/","snippet":"Jan 22, 2025 ... Government needs to rethink how it procures digitally, including how to deal with 'big tech' and global cloud providers that are bigger than ...","headings":["Search","Editorial","Government not equipped to deal with ‘big tech’ suppliers – report","If you liked this content…","If you are interested in this article, why not register to attend our Think Digital Government conference, where digital leaders tackle the most pressing issues facing government today.","Liked this article?","Follow us","About us","Contact us","Subscribe"],"wordCount":985},{"title":"We need to tax the tech oligarchy to reduce their control - Tax ...","link":"https://taxjustice.uk/blog/we-need-to-tax-the-tech-oligarchy-to-reduce-their-control/","snippet":"Jan 22, 2025 ... Extreme wealth is extreme control over politicians. Billionaires' influence over politics will grow further under Trump's government.","headings":["We need to tax the tech oligarchy to reduce their control","Wealth and control","Tax their wealth","Keep pushing together"],"wordCount":629},{"title":"UK government warned against reliance on “big tech” for ...","link":"https://cpostrategy.media/blog/2025/01/23/uk-government-warned-against-reliance-on-big-tech-for-procurement-by-nao/","snippet":"Jan 22, 2025 ... The NAO's report warns that a widespread shift towards using managed services has made the UK public sector over-reliant on “Big Tech”.","headings":["UK government warned against reliance on “big tech” for procurement by NAO","The £14 billion problem","Related Stories","Category management entropy— Why procurement is failing to deliver the benefits it once did","Navigating risk: Integrating procurement and third-party risk management","Digital transformation shortcomings creating “gaps” in third-party logistics","Procurement e-auctions startup Crown raises €2 million streamline negotiation process","Between hype and anticipation – Five tips for getting started with AI in procurement","Digital procurement transformation: A blueprint for competitive advantage","The balancing act — In defence of tactical procurement","Top 5 strategies to manage procurement risk","What are the biggest challenges of AI integration in procurement?","We believe in a personal approach","Join the CPOstrategy community for free to receive:","CPOstrategy presents an unmissable journey to harnessing AI in procurement","CPOstrategy presents The ProcureTech100 Yearbook 2024"],"wordCount":2474},{"title":"How will tech and politics shape the automotive sector in 2025?","link":"https://www.digit.fyi/how-will-tech-and-politics-shape-the-automotive-sector-in-2025/","snippet":"Jan 16, 2025 ... Gartner has outlined how certain technologies and geopolitical shifts will shape the automotive sector in the coming year.","headings":["Site navigation","","How Will Tech and Politics Shape the Automotive Sector in 2025?","Tell the world!","Related","Editor's Picks","Latest News","<img src=\"https://www.digit.fyi/wp-content/themes/digit/img/logos/LogoWhite.svg\" alt=\"Digit\" />"],"wordCount":3442},{"title":"The new digital transformation: What happens when tech firms play ...","link":"https://www.computing.co.uk/opinion/2025/political-reality-tech","snippet":"Jan 15, 2025 ... Amanda Brock examines Big Tech's political power, and the fine line governments have to walk in both learning from and regulating the likes of Meta, Google and ...","headings":["The new digital transformation: What happens when tech firms play politics?","‘It’s a difficult path to a brave new world’","Hiring doesn’t work both ways","A fine line","Balancing risk and reward"],"wordCount":1439}],"contentGaps":[{"category":"\"Political Influence Through Philanthropy\"","headings":["\"How Tech Mogul Bill Gates is Influencing Politics and Driving Social Change Through Philanthropy\""]},{"category":"Concerns about dependence on big tech companies in UK government procurement.","headings":["The UK government has been cautioned by the National Audit Office to avoid relying solely on \"big tech\" companies for procurement contracts, citing concerns about monopolies and lack of competition."]},{"category":"\"Struggles with Political Tech Adaptation\"","headings":["\"The Tech Challenge: why UK political parties are struggling to adapt to the changing landscape of online communication and technological advancements in campaigning tactics.\""]},{"category":"Progressive Tax Policies for Reducing Tech Oligarchy Influence","headings":["\"In order to address issues of income inequality and curb the growing influence of large tech corporations, there is a need for implementing progressive tax policies that target the wealthy individuals and companies within the tech oligarchy.\""]},{"category":"\"Technology and Politics in Society and Business\"","headings":["\"The new digital transformation: Exploring the intersection of technology and politics, and the potential impact on society and business.\""]}]}

    // Run SEO analysis and competitor analysis in parallel.
    const [seoResults, competitorResults] = await Promise.all([
      this.seoService.analyzeKeywords(content),
      this.competitorAnalysisService.fetchCompetitorData(keyword),
    ]);

    this.logger.log(`seoResults:  ${JSON.stringify(seoResults)}`);
    this.logger.log(`competitorResults:  ${JSON.stringify(competitorResults)}`);

    // Generate suggested title and meta description.
    const titleMetaPrompt = `
Based on the following primary keyword and competitor insights, generate a suggested title and meta description for an article.

You will receive a JSON object containing a primary keyword and a set of competitor themes. 

Provide the output in JSON format:
{
  "title": "<suggested title>",
  "metaDescription": "<suggested meta description>"
}
    `;

    const titlePayload = {
      primaryKeyword: seoResults.primaryKeywords.map((k) => k.name).join(', '),
      competitorThemes: competitorResults.contentGaps
        .map((c) => c.category)
        .join(', '),
    };

    const titleMetaResponse = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      // prompt: structurePrompt,
      messages: [
        { role: 'developer', content: titleMetaPrompt },
        {
          role: 'user',
          content: `${JSON.stringify(titlePayload)}`,
        },
      ],
      response_format: {
        // See /docs/guides/structured-outputs
        type: 'json_object',
      },
    });

    // const titleMetaResponse = await this.openai.completions.create({
    //   model: 'gpt-3.5-turbo-instruct',
    //   prompt: titleMetaPrompt,
    //   max_tokens: 100,
    // });
    // const titleMetaJson = JSON.parse(titleMetaResponse.choices[0].text.trim());
    this.logger.log(
      `raw titleMetaResponse: ${JSON.stringify(titleMetaResponse.choices[0].message.content)}`,
    );
    const titleMetaJson = this.parseOpenAiOutput(titleMetaResponse);

    // Generate content structure (H1, H2, H3 headings).
    this.logger.log(
      `contentGaps: ${JSON.stringify(competitorResults.contentGaps)}`,
    );
    const structurePrompt = `
Based on the following competitor analysis insights, generate a suggested content structure for an article.

You will receive a JSON file outlining competitor content gaps and themes. 

Provide the structure in JSON format with keys "h1", "h2", and "h3". For example:
{
  "h1": "<main title>",
  "h2": ["<subheading1>", "<subheading2>", ...],
  "h3": ["<detail heading1>", "<detail heading2>", ...]
}
    `;
    const structureResponse = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      // prompt: structurePrompt,
      messages: [
        { role: 'developer', content: structurePrompt },
        {
          role: 'user',
          content: `${JSON.stringify(competitorResults.contentGaps)}`,
        },
      ],
      response_format: {
        // See /docs/guides/structured-outputs
        type: 'json_object',
      },
    });

    this.logger.log(
      `raw structureResponse: ${JSON.stringify(structureResponse.choices[0].message.content)}`,
    );
    const structureJson = this.parseOpenAiOutput(structureResponse);

    // Generate SEO guidelines, CTAs, and writing style recommendations.
    const seoPrompt = `
Given the following keywords and competitor insights, generate a set of SEO guidelines, key themes, and recommendations for an article.

You will receive a JSON object containing primary keywords, secondary keywords and a set of competitor themes. 

Provide the output in JSON format:
{
  "seoGuidelines": "<guidelines and key themes>",
  "callToActions": ["<CTA1>", "<CTA2>", ...],
  "writingStyleRecommendations": "<recommendations>"
}
    `;

    const seoPayload = {
      primaryKeywords: seoResults.primaryKeywords.map((k) => k.name).join(', '),
      secondaryKeywords: seoResults.secondaryKeywords
        .map((k) => k.name)
        .join(', '),
      competitorThemes: competitorResults.contentGaps
        .map((c) => c.category)
        .join(', '),
    };

    const seoResponse = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'developer', content: seoPrompt },
        {
          role: 'user',
          content: `${JSON.stringify(seoPayload)}`,
        },
      ],
      response_format: {
        type: 'json_object',
      },
    });
    const seoJson = this.parseOpenAiOutput(seoResponse);

    // Assemble the Markdown content.
    const markdownContent = `
# ${titleMetaJson.title}

**Meta Description:** ${titleMetaJson.metaDescription}

---

## Content Structure

**H1:** ${structureJson.h1}

**H2:**
${Array.isArray(structureJson.h2) ? structureJson.h2.map((item) => `- ${item}`).join('\n') : structureJson.h2}

**H3:**
${Array.isArray(structureJson.h3) ? structureJson.h3.map((item) => `- ${item}`).join('\n') : structureJson.h3}

---

## SEO Guidelines & Key Themes

${seoJson.seoGuidelines}

---

## Call To Actions

${Array.isArray(seoJson.callToActions) ? seoJson.callToActions.map((item) => `- ${item}`).join('\n') : seoJson.callToActions}

---

## Writing Style Recommendations

${seoJson.writingStyleRecommendations}

---

## Keywords

**Primary Keywords:** ${seoResults.primaryKeywords.map((k) => k.name).join(', ')}

**Secondary Keywords:** ${seoResults.secondaryKeywords.map((k) => k.name).join(', ')}

---

## Competitor Insights

${competitorResults.competitors.map((c) => `- [${c.title}](${c.link})`).join('\n')}

---

## Content Gaps

${competitorResults.contentGaps.map((c) => `### ${c.category}\n${c.headings.join('\n')}`).join('\n\n')}
    `;

    // Write the Markdown content to a file.
    // For simplicity, files are stored in a "briefs_output" folder relative to the project root.
    const fileName = `brief_${userId}_${Date.now()}.md`;
    const filePath = path.join(__dirname, '..', 'briefs_output', fileName);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, markdownContent, 'utf8');
    this.logger.log(`Markdown brief created at: ${filePath}`);

    // Create the brief document in the database, including the Markdown file URL/path.
    // (If you later expose these files via HTTP, adjust this value accordingly.)
    const briefData = {
      userId,
      topic,
      outline: Array.isArray(structureJson.h2)
        ? structureJson.h2
        : [structureJson.h2],
      keywords: seoResults.primaryKeywords.map((k) => k.name),
      markdownUrl: filePath, // Save the file path; update schema if necessary.
      generatedAt: new Date(),
      // Optionally include additional fields (title, metaDescription, etc.).
    };

    const createdBrief = new this.briefModel(briefData);
    return createdBrief.save();
  }

  async findAll(): Promise<Brief[]> {
    return this.briefModel.find().exec();
  }

  async findByUserId(userId: string): Promise<Brief[]> {
    return this.briefModel.find({ userId }).exec();
  }
}
