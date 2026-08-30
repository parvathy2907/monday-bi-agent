import React from 'react';
import { cn } from '@lib/utils';

interface FormattedResponseProps {
  content: string;
}

function formatCurrency(text: string): string {
  // Add space between numbers and words (e.g., "11completed" → "11 completed")
  let formatted = text.replace(/(\d+)([a-zA-Z])/g, '$1 $2');
  
  // Fix percentage formatting (ensure % is attached, with space before if needed)
  formatted = formatted.replace(/(\d+)\s*%/g, '$1%');
  
  // Fix deals/orders/items formatting
  formatted = formatted.replace(/₹\s*(\d+)\s*(deals|orders|items|projects|work)/gi, '$1 $2');
  
  // Format large numbers to Cr/L/K notation
  const formatNumber = (num: number): string => {
    if (num >= 10000000) {
      return `₹${(num / 10000000).toFixed(1)}Cr`;
    } else if (num >= 100000) {
      return `₹${(num / 100000).toFixed(1)}L`;
    } else if (num >= 1000) {
      return `₹${(num / 1000).toFixed(0)}K`;
    }
    return `₹${num.toLocaleString('en-IN')}`;
  };

  // Replace currency patterns (but preserve non-currency numbers)
  formatted = formatted.replace(/₹\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*(crore|cr|lakh|l|thousand|k)?/gi, (match, num, unit) => {
    const cleanNum = parseFloat(num.replace(/,/g, ''));
    if (isNaN(cleanNum)) return match;

    const lowerUnit = unit?.toLowerCase() || '';
    if (lowerUnit.includes('cr')) {
      return `₹${cleanNum.toFixed(1)}Cr`;
    } else if (lowerUnit.includes('l')) {
      return `₹${cleanNum.toFixed(1)}L`;
    } else if (lowerUnit.includes('k')) {
      return `₹${cleanNum.toFixed(0)}K`;
    }

    return formatNumber(cleanNum);
  });
  
  return formatted;
}

function parseContent(content: string): React.ReactElement[] {
  // Check if content contains a markdown table
  const tableMatch = content.match(/\n([\w\s]+\|[\w\s]+\|[\w\s]+)\n(-+\|-+\|-+)\n((?:.*\|.*\|.*\n?)+)/);
  if (tableMatch) {
    // Parse and render the table
    const [, headerRow, , bodyRows] = tableMatch;
    const headers = headerRow.split('|').map(h => h.trim());
    const rows = bodyRows.trim().split('\n').map(row => row.split('|').map(cell => cell.trim()));
    
    // Get content before and after table
    const beforeTable = content.substring(0, content.indexOf(tableMatch[0]));
    const afterTable = content.substring(content.indexOf(tableMatch[0]) + tableMatch[0].length);
    
    // Parse content before table
    const beforeElements = parseContentWithoutTable(beforeTable);
    
    // Add table
    const tableElement = (
      <div key="table" className="my-4 overflow-hidden rounded-lg border border-[hsl(var(--border))]">
        <table className="w-full text-sm">
          <thead className="bg-[hsl(var(--muted))] text-[hsl(var(--color-frost))]">
            <tr>
              {headers.map((header, i) => (
                <th key={i} className="px-4 py-2.5 text-left font-medium">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[hsl(var(--border))]">
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-[hsl(var(--muted))]/30 transition-colors">
                {row.map((cell, j) => (
                  <td key={j} className={cn(
                    "px-4 py-2.5",
                    j === 0 ? "font-medium text-[hsl(var(--foreground))]" : "text-[hsl(var(--color-text-slate))]",
                    j === 2 ? "font-mono text-[hsl(var(--color-sky))]" : ""
                  )}>
                    {formatCurrency(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    
    // Parse content after table
    const afterElements = parseContentWithoutTable(afterTable);
    
    return [...beforeElements, tableElement, ...afterElements];
  }
  
  return parseContentWithoutTable(content);
}

function parseContentWithoutTable(content: string): React.ReactElement[] {
  const lines = content.split('\n');
  const elements: React.ReactElement[] = [];
  let currentList: string[] = [];
  let lineIndex = 0;

  const flushList = () => {
    if (currentList.length > 0) {
      elements.push(
        <ul key={`list-${lineIndex}`} className="my-3 space-y-1.5 pl-1">
          {currentList.map((item, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-1 text-[hsl(var(--color-sky))] leading-none">•</span>
              <span className="flex-1 leading-relaxed">{formatCurrency(item)}</span>
            </li>
          ))}
        </ul>
      );
      currentList = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    lineIndex = i;

    if (!line) {
      flushList();
      continue;
    }
    
    // Skip markdown table separator lines
    if (/^-+\|-+\|-+/.test(line)) {
      continue;
    }

    // Check for heading patterns (ALL CAPS, Title Case followed by colon, or markdown-style #)
    const isHeading = 
      /^[A-Z\s]+:?\s*$/.test(line) || 
      /^#{1,3}\s+/.test(line) ||
      (/^[A-Z][A-Za-z\s]+:$/.test(line) && line.length < 50);

    if (isHeading) {
      flushList();
      const headingText = line.replace(/^#+\s+/, '').replace(/:$/, '');
      
      // Detect special sections
      const isKeyTakeaway = /key\s+takeaway/i.test(headingText);
      const isSummary = /summary|overview/i.test(headingText);

      elements.push(
        <h3
          key={`heading-${i}`}
          className={cn(
            'mb-2 mt-4 font-medium tracking-tight first:mt-0',
            isKeyTakeaway ? 'text-base text-[hsl(var(--color-sky))]' : 
            isSummary ? 'text-lg text-[hsl(var(--color-frost))]' :
            'text-base text-[hsl(var(--color-frost))]'
          )}
        >
          {headingText}
        </h3>
      );
      continue;
    }

    // Check for bullet points (•, -, *, numbered)
    const bulletMatch = line.match(/^[•\-*]\s+(.+)$/) || line.match(/^\d+\.\s+(.+)$/);
    if (bulletMatch) {
      currentList.push(bulletMatch[1]);
      continue;
    }

    // Regular paragraph
    flushList();
    
    // Check if line contains a metric (number followed by description)
    const metricMatch = line.match(/^(₹?[\d,.]+[A-Za-z]*)\s+(.+)$/);
    if (metricMatch && metricMatch[1].length < 20) {
      elements.push(
        <div key={`metric-${i}`} className="my-3 flex items-baseline gap-3">
          <span className="font-mono text-2xl font-medium text-[hsl(var(--color-sky))]">
            {formatCurrency(metricMatch[1])}
          </span>
          <span className="text-sm text-[hsl(var(--color-text-slate))]">
            {metricMatch[2]}
          </span>
        </div>
      );
      continue;
    }

    elements.push(
      <p key={`para-${i}`} className="my-2 leading-relaxed">
        {formatCurrency(line)}
      </p>
    );
  }

  flushList();
  return elements;
}

function formatLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatParsedJson(val: any, depth = 0): string {
  if (val === null || val === undefined) {
    return '';
  }

  if (typeof val === 'string') {
    return val;
  }

  if (typeof val === 'number' || typeof val === 'boolean') {
    return String(val);
  }

  if (Array.isArray(val)) {
    return val
      .map((item) => formatParsedJson(item, depth))
      .filter(Boolean)
      .join('\n');
  }

  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;

    // Handle sector metric objects explicitly
    const keys = Object.keys(obj);
    if (
      keys.length === 2 &&
      (keys.includes('deal_count') || keys.includes('deals')) &&
      (keys.includes('total_value_inr') || keys.includes('value') || keys.includes('total_value'))
    ) {
      const dealCount = obj.deal_count ?? obj.deals ?? 0;
      const rawValue = obj.total_value_inr ?? obj.value ?? obj.total_value ?? 0;
      const formattedVal = typeof rawValue === 'number' ? formatCurrency(String(rawValue)) : String(rawValue);
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
          const formattedVal = formatParsedJson(v, depth + 1);
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
      const formattedVal = formatParsedJson(childValue, depth + 1);

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

  return String(val);
}

export function FormattedResponse({ content }: FormattedResponseProps) {
  // Check if content looks like JSON
  if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(content);
      
      if (typeof parsed === 'object' && parsed !== null) {
        const formattedText = formatParsedJson(parsed);
        return <div className="space-y-1">{parseContent(formattedText)}</div>;
      }
    } catch {
      // Not valid JSON, treat as plain text
    }
  }

  return <div className="space-y-1">{parseContent(content)}</div>;
}
