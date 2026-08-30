# Decision Log: Monday.com BI Agent Prototype

## 1. Tech Stack Choices & Rationale
*   **Frontend Framework:** React with TanStack Start (v1.168.49) & TanStack Router.
    *   *Rationale:* TanStack Start integrates SSR (Server-Side Rendering) with type-safe server functions (`createServerFn`). This allows us to securely access environment API keys (Monday.com tokens and Gemini keys) on the server without leaking them to the client-side browser bundle.
*   **Bundler & Config:** Vite.
    *   *Rationale:* Vite is the default compiler for modern TanStack Start, offering instant Hot Module Replacement (HMR) and extremely fast compilation.
*   **Styling:** Tailwind CSS (v4) & Vanilla CSS variables.
    *   *Rationale:* Provides a modern, responsive developer experience with highly customized glassmorphic themes.
*   **LLM Model:** Google Gemini 3.6 Flash (`gemini-3.6-flash`).
    *   *Rationale:* Excellent context-window capacity, high reasoning speeds, and robust structured instruction-following.

---

## 2. Key Assumptions
1.  **Column Identification Resilience:** Monday.com column IDs vary between accounts and imports. We assume column headers can be identified by matching human-readable titles (e.g., `'Nature of Work'`, `'Masked Deal value'`, `'Execution Status'`) case-insensitively, and map them to standard camelCase properties in our SDK.
2.  **Deterministic Math:** LLMs are notorious for failing at simple arithmetic on large datasets. We assume that all aggregations (sums, counts, averages, and group-bys) must be calculated deterministically on the server in TypeScript, and only passed to the LLM as verified context.
3.  **Read-Only Scope:** In accordance with the prompt, the agent operates in a read-only manner against Monday.com boards and does not mutate deal or work order items.
4.  **Currency Normalization:** All financial numbers are assumed to represent Indian Rupees (INR) and are formatted using the Indian numbering system (e.g., ₹Crores, ₹Lakhs).

---

## 3. Trade-offs Chosen and Why
*   **Server-Side Pre-Aggregation vs. Raw Vector Embeddings:**
    *   *Trade-off:* We perform complete deterministic aggregation of the raw board rows on the server first, rather than feeding raw rows to the LLM or putting them in a vector database (RAG).
    *   *Why:* Pre-aggregating data ensures 100% mathematical precision and completely eliminates AI hallucination. The LLM acts as an interpreter of verified metrics rather than a calculator, guaranteeing executive-facing reliability.
*   **Monday.com GraphQL REST fetch vs. SDK Package:**
    *   *Trade-off:* We implement raw `fetch` calls to Monday's GraphQL endpoint in `BoardSDK.ts` instead of installing the official Monday Client SDK.
    *   *Why:* Keeps the project footprint small, avoids dependency version conflicts with Vite, and allows us to easily handle connection failure fallbacks.

---

## 4. Interpretation of "Leadership Updates"
We interpreted "Leadership Updates" as a request for a structured, executive-level synthesis of operational health across all business dimensions:
*   **Finance & Collection Risk:** Receivables outstanding, billed vs. collected value, and counts of stuck invoices.
*   **Execution Velocity:** Active work orders count, completed tasks, and data hygiene indicators.
*   **Pipeline Health:** Total opportunities, overall valuation of the open sales funnel, and sector-wise concentrations.
When a user asks for a "leadership update", the agent automatically compiles these categories into a clean, bulleted executive brief.

---

## 5. What We'd Do Differently with More Time
1.  **OAuth 2.0 Integration:** Add Monday.com OAuth so users can sign in with their active Monday profiles instead of inputting static API tokens in `.env`.
2.  **Rich Visualizations:** Render charts (using Recharts) directly in the conversational bubbles for sector pipeline values and billing distributions.
3.  **NL-to-GraphQL:** Implement dynamic GraphQL query generation so the LLM can query specific row filters (e.g. "deals closed last week") directly on Monday.com.
