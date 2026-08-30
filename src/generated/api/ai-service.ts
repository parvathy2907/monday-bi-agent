export async function executeAiRequest(
  prompt: string,
  options?: { systemPrompt?: string }
): Promise<{ data: string }> {
  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (geminiKey) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${geminiKey}`;
      const payload: any = {
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ]
      };
      if (options?.systemPrompt) {
        payload.systemInstruction = {
          parts: [
            {
              text: options.systemPrompt
            }
          ]
        };
      }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Gemini API error: ${res.statusText}. Details: ${text}`);
      }
      const json = await res.json();
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        return { data: text };
      }
    } catch (err) {
      console.error("Gemini API call failed, using mock response:", err);
    }
  }

  if (openaiKey) {
    try {
      const messages = [];
      if (options?.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt });
      }
      messages.push({ role: 'user', content: prompt });
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages
        })
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`OpenAI API error: ${res.statusText}. Details: ${text}`);
      }
      const json = await res.json();
      const text = json.choices?.[0]?.message?.content;
      if (text) {
        return { data: text };
      }
    } catch (err) {
      console.error("OpenAI API call failed, using mock response:", err);
    }
  }

  // Fallback to local mock generator if no key is configured or API calls fail
  return { data: getMockResponse(prompt) };
}

function getMockResponse(prompt: string): string {
  const query = prompt.toLowerCase();

  // Extract the VERIFIED AGGREGATED DATA JSON segment from the prompt
  const dataMatch = prompt.match(/VERIFIED AGGREGATED DATA:\s*\n(.*?)\n\s*\n/s);
  let data: any = null;
  if (dataMatch) {
    try {
      data = JSON.parse(dataMatch[1]);
    } catch {}
  }

  if (!data) {
    return "No verified business data was provided in the prompt context.";
  }

  if (query.includes("pipeline") || query.includes("sector")) {
    const lines = ["Pipeline By Sector\n"];
    for (const r of data.sector_ranking || []) {
      const crFormatted = r.value >= 10000000 ? `₹${(r.value / 10000000).toFixed(1)}Cr` :
                          r.value >= 100000 ? `₹${(r.value / 100000).toFixed(1)}L` :
                          `₹${r.value.toLocaleString('en-IN')}`;
      lines.push(`${r.sector}`);
      lines.push(`Deals: ${r.deals}`);
      lines.push(`Pipeline value: ${crFormatted}\n`);
    }
    return lines.join("\n").trim();
  }

  if (query.includes("exposure") || query.includes("open deal")) {
    const exp = data.open_deal_exposure || { total_value: 0, deal_count: 0 };
    const expFormatted = exp.total_value >= 10000000 ? `₹${(exp.total_value / 10000000).toFixed(1)}Cr` :
                         exp.total_value >= 100000 ? `₹${(exp.total_value / 100000).toFixed(1)}L` :
                         `₹${exp.total_value.toLocaleString('en-IN')}`;
    return `Open Deal Exposure\n\nWe have a total exposure of ${expFormatted} across ${exp.deal_count} open pipeline deals. The sectors involved are ranked by pipeline value under sector analysis.`;
  }

  if (query.includes("billing") || query.includes("collection") || query.includes("risk")) {
    const risk = data.billing_collection_risk || { total_receivable: 0, total_billed: 0, total_collected: 0, uncollected: 0, stuck_count: 0 };
    const rec = risk.total_receivable >= 10000000 ? `₹${(risk.total_receivable / 10000000).toFixed(1)}Cr` : `₹${(risk.total_receivable / 100000).toFixed(1)}L`;
    const uncollected = risk.uncollected >= 10000000 ? `₹${(risk.uncollected / 10000000).toFixed(1)}Cr` : `₹${(risk.uncollected / 100000).toFixed(1)}L`;
    return `Billing & Collection Risk Analysis\n\n• Total Accounts Receivable: ${rec}\n• Uncollected Billed Value: ${uncollected}\n• Not Billed Count: ${risk.not_billed_count || 0} work orders\n• Stuck Bills: ${risk.stuck_count || 0} work orders\n• Partially Billed: ${risk.partially_billed_count || 0} work orders`;
  }

  // Leadership update / prepare a leadership update / default fallback
  const totalPipeline = data.pipeline_summary?.total_value_formatted || "₹0";
  const totalDeals = data.pipeline_summary?.total_deals || 0;
  const risk = data.billing_collection_risk || {};
  const uncollected = risk.uncollected >= 10000000 ? `₹${(risk.uncollected / 10000000).toFixed(1)}Cr` : `₹${(risk.uncollected / 100000).toFixed(1)}L`;

  return `Executive Summary\n\nThis update provides an overview of the operations, pipeline, and financial risks for leadership, pulled directly from our active boards.\n\nLeadership Update\n\n• Billing & Collections: Total receivables stand at ₹${(risk.total_receivable / 10000000).toFixed(1)}Cr. There is an uncollected value of ${uncollected} from already billed items.\n• Execution: We are monitoring ${data.data_quality?.work_orders?.total || 0} active work orders. ${data.billing_collection_risk?.stuck_count || 0} bills are currently stuck.\n• Pipeline: The sales pipeline contains ${totalDeals} open deals totaling ${totalPipeline} in value.\n• Risks: Main risk areas are collections backlog and incomplete metadata (e.g. ${data.data_quality?.deals?.missing_fields?.deal_value || 0} deals missing value definitions).`;
}
