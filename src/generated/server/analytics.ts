import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { WorkordertrackerDataBoard } from '@api/BoardSDK';
import { DealFunnelDataBoard } from '@api/BoardSDK';
import { executeAiRequest } from '@api/ai-service';

/**
 * Safely convert values coming from monday.com into numbers.
 * Board values may sometimes arrive as strings, numbers, null or undefined.
 */
function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '').replace(/[₹$]/g, '').trim();
    const parsed = Number(cleaned);

    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

/**
 * Normalize text values.
 */
function toText(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) {
    return fallback;
  }

  return String(value).trim() || fallback;
}

/**
 * Format INR values for leadership-facing output.
 */
function formatCurrency(value: number): string {
  const amount = toNumber(value);

  if (amount >= 10_000_000) {
    return `₹${(amount / 10_000_000).toFixed(1)}Cr`;
  }

  if (amount >= 100_000) {
    return `₹${(amount / 100_000).toFixed(1)}L`;
  }

  if (amount >= 1_000) {
    return `₹${(amount / 1_000).toFixed(0)}K`;
  }

  return `₹${amount.toLocaleString('en-IN')}`;
}

/**
 * Compute deterministic business aggregations.
 *
 * This is intentionally performed on the server instead of asking the AI
 * to calculate totals. This makes the dashboard more reliable and auditable.
 */
function computeAggregations(
  workOrders: any[],
  deals: any[]
) {
  /**
   * ---------------------------------------------------------
   * PIPELINE BY SECTOR (Open Deals Only)
   * ---------------------------------------------------------
   */
  const pipelineDeals = deals.filter((deal) => {
    const status = toText(deal.dealStatus).toLowerCase();
    return status === 'open';
  });

  const pipelineBySector: Record<
    string,
    {
      deal_count: number;
      total_value_inr: number;
    }
  > = {};

  let totalPipelineValue = 0;
  let valuedDealCount = 0;
  let unvaluedDealCount = 0;

  for (const deal of pipelineDeals) {
    const sector = toText(deal.sectorservice, 'Unknown');
    const value = toNumber(deal.maskedDealValue);

    if (!pipelineBySector[sector]) {
      pipelineBySector[sector] = {
        deal_count: 0,
        total_value_inr: 0,
      };
    }

    pipelineBySector[sector].deal_count += 1;

    if (value > 0) {
      pipelineBySector[sector].total_value_inr += value;
      totalPipelineValue += value;
      valuedDealCount += 1;
    } else {
      unvaluedDealCount += 1;
    }
  }

  /**
   * ---------------------------------------------------------
   * DEAL STATUS BREAKDOWN
   * ---------------------------------------------------------
   */
  const dealStatusBreakdown: Record<string, number> = {};

  for (const deal of deals) {
    const status = toText(deal.dealStatus, 'Unknown');

    dealStatusBreakdown[status] =
      (dealStatusBreakdown[status] || 0) + 1;
  }

  /**
   * ---------------------------------------------------------
   * OPEN DEAL EXPOSURE (Won deals are excluded)
   * ---------------------------------------------------------
   */
  const openDeals = deals.filter(
    (deal) => toText(deal.dealStatus).toLowerCase() === 'open'
  );
  const openDealExposure = openDeals.reduce(
    (sum, deal) => sum + toNumber(deal.maskedDealValue),
    0
  );

  const wonDeals = deals.filter(
    (deal) => toText(deal.dealStatus).toLowerCase() === 'won'
  );
  const wonDealValue = wonDeals.reduce(
    (sum, deal) => sum + toNumber(deal.maskedDealValue),
    0
  );

  const lostDeals = deals.filter(
    (deal) => toText(deal.dealStatus).toLowerCase() === 'lost'
  );
  const lostDealValue = lostDeals.reduce(
    (sum, deal) => sum + toNumber(deal.maskedDealValue),
    0
  );

  /**
   * ---------------------------------------------------------
   * EXECUTION STATUS
   * ---------------------------------------------------------
   */
  const executionStatus: Record<string, number> = {};

  for (const workOrder of workOrders) {
    const status = toText(
      workOrder.executionStatus,
      'Unknown'
    );

    executionStatus[status] =
      (executionStatus[status] || 0) + 1;
  }

  /**
   * ---------------------------------------------------------
   * BILLING / COLLECTION
   * ---------------------------------------------------------
   */
  const totalReceivable = workOrders.reduce(
    (sum, workOrder) =>
      sum + toNumber(workOrder.amountReceivableMasked),
    0
  );

  const totalBilled = workOrders.reduce(
    (sum, workOrder) =>
      sum +
      toNumber(
        workOrder.billedValueInRupeesExclOfGstMasked
      ),
    0
  );

  const totalCollected = workOrders.reduce(
    (sum, workOrder) =>
      sum +
      toNumber(
        workOrder.collectedAmountInRupeesInclOfGstMasked
      ),
    0
  );

  const uncollected = Math.max(
    totalBilled - totalCollected,
    0
  );

  const notBilledCount = workOrders.filter((workOrder) => {
    const status = toText(workOrder.billingStatus).toLowerCase();

    return (
      status === 'not billed yet' ||
      status === 'update required'
    );
  }).length;

  const stuckCount = workOrders.filter((workOrder) => {
    return (
      toText(workOrder.billingStatus).toLowerCase() ===
      'stuck'
    );
  }).length;

  const partiallyBilledCount = workOrders.filter(
    (workOrder) =>
      toText(workOrder.billingStatus).toLowerCase() ===
      'partially billed'
  ).length;

  /**
   * ---------------------------------------------------------
   * WORK ORDER DATA QUALITY
   * ---------------------------------------------------------
   */
  const woNullFields = {
    sector: workOrders.filter(
      (wo) => !toText(wo.sector)
    ).length,

    execution_status: workOrders.filter(
      (wo) => !toText(wo.executionStatus)
    ).length,

    billing_status: workOrders.filter(
      (wo) => !toText(wo.billingStatus)
    ).length,

    amount: workOrders.filter(
      (wo) =>
        toNumber(wo.amountInRupeesExclOfGstMasked) === 0
    ).length,
  };

  /**
   * ---------------------------------------------------------
   * DEAL DATA QUALITY
   * ---------------------------------------------------------
   */
  const dealNullFields = {
    sector: deals.filter(
      (deal) => !toText(deal.sectorservice)
    ).length,

    deal_value: deals.filter(
      (deal) =>
        toNumber(deal.maskedDealValue) === 0
    ).length,

    closure_probability: deals.filter(
      (deal) =>
        !toText(deal.closureProbability)
    ).length,

    close_date: deals.filter(
      (deal) =>
        !toText(deal.closeDateA) &&
        !toText(deal.tentativeCloseDate)
    ).length,
  };

  /**
   * ---------------------------------------------------------
   * SECTOR RANKING
   * ---------------------------------------------------------
   */
  const sectorRanking = Object.entries(
    pipelineBySector
  )
    .map(([sector, metrics]) => ({
      sector,
      deals: metrics.deal_count,
      value: metrics.total_value_inr,
    }))
    .sort((a, b) => b.value - a.value);

  /**
   * ---------------------------------------------------------
   * RETURN CLEAN STRUCTURED DATA
   * ---------------------------------------------------------
   */
  return {
    pipeline_by_sector: pipelineBySector,

    pipeline_summary: {
      total_value_inr: totalPipelineValue,
      total_value_formatted:
        formatCurrency(totalPipelineValue),
      total_deals: pipelineDeals.length,
      valued_deals: valuedDealCount,
      unvalued_deals: unvaluedDealCount,
    },

    open_deal_exposure: {
      total_value: openDealExposure,
      total_value_formatted: formatCurrency(openDealExposure),
      deal_count: openDeals.length,
    },

    won_deals: {
      total_value: wonDealValue,
      total_value_formatted: formatCurrency(wonDealValue),
      deal_count: wonDeals.length,
    },

    lost_deals: {
      total_value: lostDealValue,
      total_value_formatted: formatCurrency(lostDealValue),
      deal_count: lostDeals.length,
    },

    deal_status_breakdown: dealStatusBreakdown,

    sector_ranking: sectorRanking,

    execution_status_breakdown: executionStatus,

    billing_collection_risk: {
      total_receivable: totalReceivable,
      total_billed: totalBilled,
      total_collected: totalCollected,
      uncollected,
      not_billed_count: notBilledCount,
      stuck_count: stuckCount,
      partially_billed_count: partiallyBilledCount,
    },

    data_quality: {
      work_orders: {
        total: workOrders.length,
        missing_fields: woNullFields,
      },

      deals: {
        total: deals.length,
        missing_fields: dealNullFields,
      },
    },
  };
}

/**
 * Helper to format a label from object keys.
 */
function formatLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Convert an AI response into safe plain text recursively.
 * Ensures no implicit object-to-string conversions happen.
 */
function formatStructuredResponse(
  value: unknown,
  depth = 0
): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    const cleaned = value.trim();
    if (cleaned.includes('[object Object]')) {
      return cleaned.replace(/\[object Object\]/g, '(Structured data)');
    }
    return cleaned;
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => formatStructuredResponse(item, depth))
      .filter(Boolean)
      .join('\n');
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;

    // Handle sector metric objects explicitly
    const keys = Object.keys(obj);
    if (
      keys.length === 2 &&
      (keys.includes('deal_count') || keys.includes('deals')) &&
      (keys.includes('total_value_inr') || keys.includes('value') || keys.includes('total_value'))
    ) {
      const dealCount = obj.deal_count ?? obj.deals ?? 0;
      const rawValue = obj.total_value_inr ?? obj.value ?? obj.total_value ?? 0;
      const formattedVal = typeof rawValue === 'number' ? formatCurrency(rawValue) : String(rawValue);
      return `Deals: ${dealCount}\nPipeline value: ${formattedVal}`;
    }

    const possibleTextFields = [
      'text',
      'content',
      'message',
      'answer',
      'response',
      'output',
      'executive_summary'
    ];

    for (const field of possibleTextFields) {
      const fieldValue = obj[field];

      if (
        typeof fieldValue === 'string' &&
        fieldValue.trim()
      ) {
        const mainText = fieldValue.trim();
        const otherLines: string[] = [];

        for (const [k, v] of Object.entries(obj)) {
          if (
            k === field ||
            possibleTextFields.includes(k) ||
            v === null ||
            v === undefined
          ) {
            continue;
          }
          const label = formatLabel(k);
          const formattedVal = formatStructuredResponse(v, depth + 1);
          if (formattedVal) {
            otherLines.push(`\n${label}\n${formattedVal}`);
          }
        }

        if (otherLines.length > 0) {
          return `${mainText}\n${otherLines.join('\n')}`;
        }
        return mainText;
      }
    }

    const lines: string[] = [];
    const indent = '  '.repeat(depth);

    for (const [key, childValue] of Object.entries(obj)) {
      if (
        childValue === null ||
        childValue === undefined
      ) {
        continue;
      }

      const label = formatLabel(key);
      const formattedVal = formatStructuredResponse(childValue, depth + 1);

      if (formattedVal) {
        if (typeof childValue === 'object' && !Array.isArray(childValue)) {
          lines.push(`${indent}${label}\n${formattedVal}`);
        } else {
          lines.push(`${indent}${label}: ${formattedVal}`);
        }
      }
    }

    return lines.join('\n\n');
  }

  return String(value);
}

/**
 * ---------------------------------------------------------
 * AI-POWERED QUERY ENDPOINT
 * ---------------------------------------------------------
 */
export async function executeBusinessQuery(query: string) {
    try {
      /**
       * Initialize monday.com boards.
       */
      const workOrderBoard =
        new WorkordertrackerDataBoard();

      const dealBoard =
        new DealFunnelDataBoard();

      /**
       * Fetch data from both boards in parallel with robust error handling.
       */
      let workOrderResponse: any;
      let dealResponse: any;

      try {
        [workOrderResponse, dealResponse] = await Promise.all([
          workOrderBoard
            .items()
            .withColumns([
              'customerNameCode',
              'serial',
              'natureOfWork',
              'executionStatus',
              'sector',
              'amountInRupeesExclOfGstMasked',
              'amountInRupeesInclOfGstMasked',
              'billedValueInRupeesExclOfGstMasked',
              'collectedAmountInRupeesInclOfGstMasked',
              'amountReceivableMasked',
              'invoiceStatus',
              'billingStatus',
              'expectedBillingMonth',
              'actualBillingMonth',
              'typeOfWork',
            ])
            .withPagination({
              limit: 500,
            })
            .execute(),

          dealBoard
            .items()
            .withColumns([
              'clientCode',
              'dealStatus',
              'dealStage',
              'closureProbability',
              'maskedDealValue',
              'sectorservice',
              'productDeal',
              'closeDateA',
              'tentativeCloseDate',
            ])
            .withPagination({
              limit: 500,
            })
            .execute(),
        ]);
      } catch (fetchError) {
        console.error('Monday.com boards fetch failed:', fetchError);
        throw new Error('Failed to retrieve live data from monday.com. Please verify board connectivity.');
      }

      const workOrders =
        workOrderResponse.items || [];

      const deals =
        dealResponse.items || [];

      /**
       * Perform deterministic calculations.
       */
      const aggregations =
        computeAggregations(
          workOrders,
          deals
        );

      /**
       * Give the AI clean aggregated data.
       *
       * IMPORTANT:
       * The AI is NOT responsible for calculating totals.
       * It interprets already-calculated business metrics.
       */
      const aiPrompt = `
You are a Business Intelligence analyst for Skylark Drones.

Answer the founder's question using ONLY the verified aggregated data below. Do not output unrelated sections or all metrics. Answer ONLY the exact question asked.

QUESTION:
${query}

VERIFIED AGGREGATED DATA:
${JSON.stringify(
        aggregations,
        null,
        2
      )}

QUERY INTERPRETATION RULES:
1. If the question asks about "open deals", "open deal exposure", "active deals", or "open pipeline", answer using the 'open_deal_exposure' aggregation only. Do NOT output a sector breakdown or the entire table.
2. If the question asks for a sector-wise pipeline breakdown (e.g. "pipeline by sector", "break down the pipeline by sector"), use 'pipeline_by_sector' or 'sector_ranking' to render the requested format.
3. If the question asks about billing, collection, receivables, or billing risks, use 'billing_collection_risk'.
4. If the question asks about work orders or execution status, use 'execution_status_breakdown' or 'data_quality.work_orders'.
5. Do not include unrelated data or fields in your response. Answer the specific question directly.

RESPONSE REQUIREMENTS:
1. Return ONLY plain text.
2. NEVER return JSON or JavaScript objects.
3. NEVER write "[object Object]".
4. Do not invent numbers. Use the verified aggregations as your absolute source of truth.
5. Format INR values using ₹Cr, ₹L or ₹K (e.g., ₹2.4Cr, ₹61.7L, ₹18.4L).
6. Keep the response concise, readable, and executive-level.

For a pipeline-by-sector request, use this structure:

Pipeline By Sector

DSP
Deals: X
Pipeline value: ₹X

Mining
Deals: X
Pipeline value: ₹X

etc.

For open deal exposure, write a concise summary like:

Open Deal Exposure

We currently have ₹XX.X Cr in open deals across XX open opportunities.
[Optional] The largest exposure is concentrated in [sector], representing ₹X.X Cr.
`;

      /**
       * Call AI with error handling.
       */
      let result: any;
      try {
        result = await executeAiRequest(
          aiPrompt,
          {
            systemPrompt: `
You are an expert Business Intelligence analyst.

Your output MUST be plain human-readable text.

Never return JSON.
Never return JavaScript objects.
Never expose internal data structures.
Never output [object Object].

Identify the specific topic of the question (e.g., open deal exposure, pipeline by sector, billing risks, work orders) and reply using ONLY the relevant section from the provided verified aggregated data. Do not dump other sections or output all metrics.

Use INR formatting:
₹30.6Cr
₹2.4Cr
₹61.7L
₹18.4L

Be concise, factual and actionable.
`,
          }
        );
      } catch (aiError) {
        console.error('AI request execution failed:', aiError);
        throw new Error('AI Service was unable to process the query. Please check prompt content.');
      }

      /**
       * Safely normalize whatever the AI service returns.
       */
      const answerText =
        formatStructuredResponse(
          result?.data
        );

      return {
        answer:
          answerText ||
          'No response generated.',

        context: {
          workOrdersCount:
            workOrders.length,

          dealsCount:
            deals.length,

          source:
            'Live monday.com boards: Work_Order_Tracker Data & Deal funnel Data',

          pipelineValue:
            aggregations.pipeline_summary
              .total_value_inr,

          pipelineValueFormatted:
            aggregations.pipeline_summary
              .total_value_formatted,

          unvaluedDeals:
            aggregations.pipeline_summary
              .unvalued_deals,
        },
      } as const;

    } catch (error) {
      console.error(
        'Error processing query:',
        error
      );

      throw new Error(
        'Failed to process your question. Please try rephrasing or contact support.'
      );
    }
}

export const processQuery = createServerFn({
  method: 'POST',
})
  .validator(
    z.object({
      query: z.string(),
    })
  )
  .handler(async ({ data }) => {
    return executeBusinessQuery(data.query);
  });

/**
 * ---------------------------------------------------------
 * QUICK DASHBOARD STATS
 * ---------------------------------------------------------
 */
export const getQuickStats =
  createServerFn({
    method: 'GET',
  })
    .validator(
      z.object({}).optional()
    )
    .handler(async () => {
      try {
        const workOrderBoard =
          new WorkordertrackerDataBoard();

        const dealBoard =
          new DealFunnelDataBoard();

        const [
          workOrderStats,
          dealStats,
        ] = await Promise.all([
          workOrderBoard
            .aggregate()
            .countItems(
              'totalWorkOrders'
            )
            .sum(
              'amountInRupeesExclOfGstMasked',
              'totalAmount'
            )
            .sum(
              'amountReceivableMasked',
              'totalReceivable'
            )
            .execute(),

          dealBoard
            .aggregate()
            .countItems(
              'totalDeals'
            )
            .sum(
              'maskedDealValue',
              'totalPipelineValue'
            )
            .execute(),
        ]);

        return {
          workOrders:
            workOrderStats[0] || {
              totalWorkOrders: 0,
              totalAmount: 0,
              totalReceivable: 0,
            },

          deals:
            dealStats[0] || {
              totalDeals: 0,
              totalPipelineValue: 0,
            },
        };

      } catch (error) {
        console.error(
          'Error fetching quick stats:',
          error
        );

        return {
          workOrders: {
            totalWorkOrders: 0,
            totalAmount: 0,
            totalReceivable: 0,
          },

          deals: {
            totalDeals: 0,
            totalPipelineValue: 0,
          },
        };
      }
    });