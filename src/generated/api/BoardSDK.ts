import mockWorkOrders from './mock_work_orders.json';
import mockDeals from './mock_deals.json';

const KEY_TO_HEADER_WO: Record<string, string> = {
  dealNameMasked: 'Deal name masked',
  customerNameCode: 'Customer Name Code',
  serial: 'Serial #',
  natureOfWork: 'Nature of Work',
  executionStatus: 'Execution Status',
  sector: 'Sector',
  amountInRupeesExclOfGstMasked: 'Amount in Rupees (Excl of GST) (Masked)',
  amountInRupeesInclOfGstMasked: 'Amount in Rupees (Incl of GST) (Masked)',
  billedValueInRupeesExclOfGstMasked: 'Billed Value in Rupees (Excl of GST.) (Masked)',
  collectedAmountInRupeesInclOfGstMasked: 'Collected Amount in Rupees (Incl of GST.) (Masked)',
  amountReceivableMasked: 'Amount Receivable (Masked)',
  invoiceStatus: 'Invoice Status',
  billingStatus: 'Billing Status',
  expectedBillingMonth: 'Expected Billing Month',
  actualBillingMonth: 'Actual Billing Month',
  typeOfWork: 'Type of Work'
};

const KEY_TO_HEADER_DEAL: Record<string, string> = {
  clientCode: 'Client Code',
  dealStatus: 'Deal Status',
  dealStage: 'Deal Stage',
  closureProbability: 'Closure Probability',
  maskedDealValue: 'Masked Deal value',
  sectorservice: 'Sector/service',
  productDeal: 'Product deal',
  closeDateA: 'Close Date (A)',
  tentativeCloseDate: 'Tentative Close Date'
};

async function fetchFromMonday(query: string, variables?: any) {
  const token = process.env.MONDAY_API_TOKEN;
  if (!token) throw new Error("MONDAY_API_TOKEN is not configured.");
  const res = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": token,
      "API-Version": "2023-10"
    },
    body: JSON.stringify({ query, variables })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Monday API HTTP error: ${res.statusText}. Details: ${text}`);
  }
  const json = await res.json();
  if (json.errors) {
    throw new Error(`Monday API GraphQL error: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

async function getBoardColumns(boardId: string) {
  const query = `
    query ($boardId: [ID!]) {
      boards (ids: $boardId) {
        columns {
          id
          title
          type
        }
      }
    }
  `;
  const data = await fetchFromMonday(query, { boardId: [boardId] });
  return data.boards?.[0]?.columns || [];
}

async function getBoardItems(boardId: string, limit: number) {
  const query = `
    query ($boardId: [ID!], $limit: Int) {
      boards (ids: $boardId) {
        items_page (limit: $limit) {
          items {
            id
            name
            column_values {
              id
              text
              value
            }
          }
        }
      }
    }
  `;
  const data = await fetchFromMonday(query, { boardId: [boardId], limit });
  return data.boards?.[0]?.items_page?.items || [];
}

class BoardAggregateBuilder {
  private board: MondayBoard;
  private ops: Array<{ type: 'count' | 'sum'; field?: string; alias: string }> = [];

  constructor(board: MondayBoard) {
    this.board = board;
  }

  countItems(alias: string) {
    this.ops.push({ type: 'count', alias });
    return this;
  }

  sum(field: string, alias: string) {
    this.ops.push({ type: 'sum', field, alias });
    return this;
  }

  async execute() {
    const items = await this.board.fetchItemsOnly();
    const result: Record<string, number> = {};
    for (const op of this.ops) {
      if (op.type === 'count') {
        result[op.alias] = items.length;
      } else if (op.type === 'sum' && op.field) {
        let sum = 0;
        for (const item of items) {
          const val = item[op.field];
          if (typeof val === 'number') {
            sum += val;
          } else if (typeof val === 'string') {
            const cleaned = val.replace(/,/g, '').replace(/[₹$]/g, '').trim();
            const parsed = Number(cleaned);
            if (Number.isFinite(parsed)) {
              sum += parsed;
            }
          }
        }
        result[op.alias] = sum;
      }
    }
    return [result];
  }
}

class MondayBoard {
  protected boardId?: string;
  protected mockData: any[] = [];
  protected keyToHeader: Record<string, string> = {};
  protected limit = 500;
  protected columns: string[] = [];

  constructor(boardId?: string, mockData: any[] = [], keyToHeader: Record<string, string> = {}) {
    this.boardId = boardId;
    this.mockData = mockData;
    this.keyToHeader = keyToHeader;
  }

  items() {
    return this;
  }

  withColumns(columns: string[]) {
    this.columns = columns;
    return this;
  }

  withPagination(pagination: { limit: number }) {
    this.limit = pagination.limit;
    return this;
  }

  aggregate() {
    return new BoardAggregateBuilder(this);
  }

  async fetchItemsOnly(): Promise<any[]> {
    const token = process.env.MONDAY_API_TOKEN;
    if (token && this.boardId) {
      try {
        const mondayColumns = await getBoardColumns(this.boardId);
        const titleToId: Record<string, string> = {};
        for (const col of mondayColumns) {
          if (col.title) {
            titleToId[col.title.toLowerCase().trim()] = col.id;
          }
        }

        const mondayItems = await getBoardItems(this.boardId, this.limit);
        const items = mondayItems.map((mItem: any) => {
          const item: Record<string, any> = {
            id: mItem.id,
            name: mItem.name
          };

          const valuesMap: Record<string, string> = {};
          for (const cv of mItem.column_values || []) {
            valuesMap[cv.id] = cv.text || '';
          }

          for (const [key, header] of Object.entries(this.keyToHeader)) {
            const colId = titleToId[header.toLowerCase().trim()];
            if (colId && colId in valuesMap) {
              item[key] = valuesMap[colId];
            } else {
              item[key] = '';
            }
          }
          return item;
        });
        return items;
      } catch (err) {
        console.error("Monday.com API fetch failed, falling back to mock data:", err);
        return this.mockData;
      }
    }
    return this.mockData;
  }

  async execute() {
    const items = await this.fetchItemsOnly();
    return { items };
  }
}

export class WorkordertrackerDataBoard extends MondayBoard {
  constructor() {
    super(
      process.env.MONDAY_WORK_ORDERS_BOARD_ID,
      mockWorkOrders,
      KEY_TO_HEADER_WO
    );
  }
}

export class DealFunnelDataBoard extends MondayBoard {
  constructor() {
    super(
      process.env.MONDAY_DEALS_BOARD_ID,
      mockDeals,
      KEY_TO_HEADER_DEAL
    );
  }
}
