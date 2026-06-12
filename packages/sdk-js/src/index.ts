import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

// --- Shared Interfaces ---

interface CarbonScoreResponse {
  sku: string;
  co2e_kg: number;
  confidence_score: string;
  tier: 'low' | 'medium' | 'high';
  calculation_method: string;
  comparison_statement: string;
  breakdown: {
    product_materials: number;
    packaging: number;
    transport_estimate: number;
  };
}

interface CheckoutResponse {
  order_total_co2e_kg: number;
  logistics_co2e_kg: number;
  grand_total_co2e_kg: number;
  comparisons: {
    miles_driven: number;
    tree_days_absorbed: number;
  };
  offset_options: {
    suggested_offset_cents: number;
    project_name: string;
  };
}

interface SuggestionItem {
  sku: string;
  title: string;
  co2e_kg: number;
  co2e_saved_kg: number;
  price_cents: number;
  reasoning: string;
}

interface SuggestionsResponse {
  original_sku: string;
  original_co2e_kg: number;
  suggestions: SuggestionItem[];
}

// --- Common Style Mixin/Variables ---
const sharedStyles = css`
  :host {
    --carbon-font: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    --carbon-color-low: #10b981;
    --carbon-color-medium: #f59e0b;
    --carbon-color-high: #ef4444;
    --carbon-bg-glass: rgba(255, 255, 255, 0.08);
    --carbon-border-glass: rgba(255, 255, 255, 0.12);
    --carbon-border-radius: 16px;
    --carbon-transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    
    font-family: var(--carbon-font);
    color: #1f2937;
  }
`;

// ==========================================
// 1. Carbon Companion Badge Component
// ==========================================

@customElement('carbon-companion-badge')
export class CarbonCompanionBadge extends LitElement {
  @property({ type: String }) sku = '';
  @property({ type: String }) apiKey = '';
  @property({ type: String }) apiHost = 'http://localhost:8080';

  @state() private score: CarbonScoreResponse | null = null;
  @state() private loading = false;
  @state() private error = false;

  static styles = [
    sharedStyles,
    css`
      :host {
        display: inline-block;
      }
      .badge-container {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 10px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
        cursor: help;
        transition: var(--carbon-transition);
        border: 1px solid rgba(0, 0, 0, 0.05);
        color: #ffffff;
      }
      .badge-container:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
      }
      .tier-low {
        background-color: var(--carbon-color-low);
      }
      .tier-medium {
        background-color: var(--carbon-color-medium);
      }
      .tier-high {
        background-color: var(--carbon-color-high);
      }
      .loading {
        background-color: #f3f4f6;
        color: #9ca3af;
        border: 1px dashed #e5e7eb;
        animation: pulse 1.5s infinite ease-in-out;
      }
      .leaf-icon {
        display: inline-block;
        width: 14px;
        height: 14px;
        fill: currentColor;
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.6; }
      }
    `
  ];

  updated(changedProperties: Map<string | number | symbol, unknown>) {
    if (changedProperties.has('sku') || changedProperties.has('apiKey') || changedProperties.has('apiHost')) {
      if (this.sku && this.apiKey) {
        this.fetchCarbonScore();
      }
    }
  }

  async fetchCarbonScore() {
    this.loading = true;
    this.error = false;

    const cacheKey = `cc_badge_${this.sku}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        this.score = JSON.parse(cached);
        this.loading = false;
        return;
      } catch {
        sessionStorage.removeItem(cacheKey);
      }
    }

    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 200); // 200ms fail-safe race condition

      const response = await fetch(
        `${this.apiHost}/v1/scores/product?sku=${encodeURIComponent(this.sku)}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Accept': 'application/json'
          },
          signal: controller.signal
        }
      );
      clearTimeout(id);

      if (!response.ok) throw new Error('Bad response status');
      const data: CarbonScoreResponse = await response.json();
      this.score = data;
      sessionStorage.setItem(cacheKey, JSON.stringify(data));
    } catch (e) {
      console.warn(`Carbon Companion: Graceful degradation for SKU ${this.sku}.`, e);
      this.error = true;
    } finally {
      this.loading = false;
    }
  }

  render() {
    if (this.loading) {
      return html`<span class="badge-container loading">Leafy CO₂e...</span>`;
    }

    if (this.error || !this.score) {
      return html``; // Degrades silently
    }

    const tierClass = `tier-${this.score.tier}`;

    return html`
      <div 
        class="badge-container ${tierClass}" 
        title="Impact: ${this.score.tier.toUpperCase()} | ${this.score.comparison_statement}"
      >
        <svg class="leaf-icon" viewBox="0 0 24 24">
          <path d="M17 8C8 10 5.9 16.17 3.8 21c4-.2 9.9-1.68 15-7.22 3.96-4.3 2-10.78 2-10.78S17.8 5 17 8zM6 18c0-3.3 2.7-6 6-6s6 2.7 6 6-2.7 6-6 6-6-2.7-6-6z" opacity=".15"/>
          <path d="M2 22c0-5.52 4.48-10 10-10 1.93 0 3.72.55 5.25 1.5L20 10.75C20.67 9.17 21 7.33 21 5.37c0-2.42-1.96-4.37-4.38-4.37-2.92 0-5.5 1.5-6.9 3.75L6.25 1.25C4.75 2.78 4.2 4.57 4.2 6.5c0 5.52 4.48 10 10 10 .85 0 1.67-.1 2.47-.3L13.7 20.3C13.15 20.75 12.6 21 12 21c-5.52 0-10-4.48-10-10zM12 2c5.52 0 10 4.48 10 10s-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2z" />
        </svg>
        <span>CO₂e: ${this.score.co2e_kg.toFixed(2)} kg</span>
      </div>
    `;
  }
}

// ==========================================
// 2. Carbon Companion Checkout Summary Widget
// ==========================================

@customElement('carbon-companion-checkout-summary')
export class CarbonCompanionCheckoutSummary extends LitElement {
  @property({ type: Array }) items: any[] = [];
  @property({ type: Object }) logistics: any = null;
  @property({ type: String }) apiKey = '';
  @property({ type: String }) apiHost = 'http://localhost:8080';

  @state() private result: CheckoutResponse | null = null;
  @state() private loading = false;
  @state() private error = false;
  @state() private offsetChecked = false;

  static styles = [
    sharedStyles,
    css`
      .card {
        background: rgba(255, 255, 255, 0.95);
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: var(--carbon-border-radius);
        padding: 20px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.04);
        max-width: 420px;
        transition: var(--carbon-transition);
      }
      .card:hover {
        box-shadow: 0 15px 35px rgba(0, 0, 0, 0.08);
      }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
        border-bottom: 1px solid rgba(0, 0, 0, 0.06);
        padding-bottom: 10px;
      }
      .header h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 700;
        color: #111827;
      }
      .total-emissions {
        font-size: 24px;
        font-weight: 800;
        color: #10b981;
        margin: 10px 0;
        display: flex;
        align-items: baseline;
        gap: 4px;
      }
      .total-emissions span {
        font-size: 14px;
        font-weight: 500;
        color: #6b7280;
      }
      .details-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        margin: 16px 0;
      }
      .detail-box {
        background: #f9fafb;
        padding: 10px;
        border-radius: 10px;
        border: 1px solid #f3f4f6;
      }
      .detail-box label {
        display: block;
        font-size: 11px;
        color: #9ca3af;
        text-transform: uppercase;
        font-weight: 600;
      }
      .detail-box val {
        font-size: 14px;
        font-weight: 700;
        color: #374151;
      }
      .offset-section {
        background: rgba(16, 185, 129, 0.05);
        border: 1px solid rgba(16, 185, 129, 0.15);
        padding: 12px;
        border-radius: 12px;
        display: flex;
        align-items: flex-start;
        gap: 10px;
        margin-top: 14px;
      }
      .offset-checkbox {
        margin-top: 3px;
        accent-color: #10b981;
        width: 16px;
        height: 16px;
        cursor: pointer;
      }
      .offset-label {
        font-size: 13px;
        color: #065f46;
        font-weight: 600;
        line-height: 1.4;
      }
      .offset-desc {
        display: block;
        font-size: 11px;
        color: #047857;
        font-weight: 400;
        margin-top: 2px;
      }
      .comparisons {
        font-size: 12px;
        color: #6b7280;
        margin-top: 12px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 8px;
        background: #f9fafb;
        border-radius: 8px;
      }
      .loading-placeholder {
        text-align: center;
        color: #9ca3af;
        font-size: 14px;
        padding: 40px 0;
      }
    `
  ];

  updated(changedProperties: Map<string | number | symbol, unknown>) {
    if (
      changedProperties.has('items') ||
      changedProperties.has('logistics') ||
      changedProperties.has('apiKey') ||
      changedProperties.has('apiHost')
    ) {
      this.calculateCheckoutFootprint();
    }
  }

  private getParsedItems(): any[] {
    if (typeof this.items === 'string') {
      try {
        return JSON.parse(this.items);
      } catch {
        return [];
      }
    }
    return Array.isArray(this.items) ? this.items : [];
  }

  private getParsedLogistics(): any {
    if (typeof this.logistics === 'string') {
      try {
        return JSON.parse(this.logistics);
      } catch {
        return null;
      }
    }
    return this.logistics;
  }

  async calculateCheckoutFootprint() {
    const parsedItems = this.getParsedItems();
    if (!this.apiKey || parsedItems.length === 0) return;

    this.loading = true;
    this.error = false;

    try {
      const response = await fetch(`${this.apiHost}/v1/scores/checkout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          items: parsedItems,
          logistics: this.getParsedLogistics()
        })
      });

      if (!response.ok) throw new Error('Checkout scoring failed');
      this.result = await response.json();
    } catch (e) {
      console.error('Carbon Companion: Failed to fetch checkout score.', e);
      this.error = true;
    } finally {
      this.loading = false;
    }
  }

  toggleOffset(e: Event) {
    const target = e.target as HTMLInputElement;
    this.offsetChecked = target.checked;

    const offsetAmount = this.result?.offset_options?.suggested_offset_cents || 0;

    // Dispatch custom event to parent application
    this.dispatchEvent(new CustomEvent('carbon-offset-changed', {
      detail: {
        checked: this.offsetChecked,
        amountCents: offsetAmount,
        projectName: this.result?.offset_options?.project_name || ''
      },
      bubbles: true,
      composed: true
    }));
  }

  render() {
    if (this.loading) {
      return html`
        <div class="card">
          <div class="loading-placeholder">Calculating carbon footprint...</div>
        </div>
      `;
    }

    if (this.error || !this.result) {
      return html``; // Gracefully degrade
    }

    return html`
      <div class="card">
        <div class="header">
          <h3>Leafy CO₂e Summary</h3>
          <svg style="width:20px;height:20px;fill:#10b981;" viewBox="0 0 24 24">
            <path d="M17 8C8 10 5.9 16.17 3.8 21c4-.2 9.9-1.68 15-7.22 3.96-4.3 2-10.78 2-10.78S17.8 5 17 8zM6 18c0-3.3 2.7-6 6-6s6 2.7 6 6-2.7 6-6 6-6-2.7-6-6z" opacity=".15"/>
            <path d="M2 22c0-5.52 4.48-10 10-10 1.93 0 3.72.55 5.25 1.5L20 10.75C20.67 9.17 21 7.33 21 5.37c0-2.42-1.96-4.37-4.38-4.37-2.92 0-5.5 1.5-6.9 3.75L6.25 1.25C4.75 2.78 4.2 4.57 4.2 6.5c0 5.52 4.48 10 10 10 .85 0 1.67-.1 2.47-.3L13.7 20.3C13.15 20.75 12.6 21 12 21c-5.52 0-10-4.48-10-10zM12 2c5.52 0 10 4.48 10 10s-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2z" />
          </svg>
        </div>

        <div class="total-emissions">
          ${this.result.grand_total_co2e_kg.toFixed(2)} <span>kg CO₂e</span>
        </div>

        <div class="details-grid">
          <div class="detail-box">
            <label>Cart Footprint</label>
            <val>${this.result.order_total_co2e_kg.toFixed(2)} kg</val>
          </div>
          <div class="detail-box">
            <label>Delivery Route</label>
            <val>${this.result.logistics_co2e_kg.toFixed(2)} kg</val>
          </div>
        </div>

        <div class="comparisons">
          <div>🚗 Equivalent to driving <b>${this.result.comparisons.miles_driven.toFixed(1)} miles</b> in a gas car.</div>
          <div>🌳 Absorbed by a mature tree in <b>${this.result.comparisons.tree_days_absorbed} days</b>.</div>
        </div>

        <div class="offset-section">
          <input 
            type="checkbox" 
            class="offset-checkbox" 
            id="offset-check"
            .checked="${this.offsetChecked}"
            @change="${this.toggleOffset}"
          />
          <div style="flex: 1;">
            <label for="offset-check" class="offset-label">
              Offset this order for $${(this.result.offset_options.suggested_offset_cents / 100).toFixed(2)}
            </label>
            <span class="offset-desc">Funds: ${this.result.offset_options.project_name}</span>
          </div>
        </div>
      </div>
    `;
  }
}

// ==========================================
// 3. Carbon Companion Eco-Swap suggestions
// ==========================================

@customElement('carbon-companion-eco-swap')
export class CarbonCompanionEcoSwap extends LitElement {
  @property({ type: String }) sku = '';
  @property({ type: String }) apiKey = '';
  @property({ type: String }) apiHost = 'http://localhost:8080';
  @property({ type: Number }) limit = 2;

  @state() private result: SuggestionsResponse | null = null;
  @state() private loading = false;
  @state() private error = false;

  static styles = [
    sharedStyles,
    css`
      .swap-card {
        background: #ffffff;
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: var(--carbon-border-radius);
        padding: 16px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.02);
        max-width: 420px;
      }
      .swap-title {
        font-size: 14px;
        font-weight: 700;
        color: #111827;
        margin: 0 0 12px 0;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .swap-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .swap-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px;
        background: #f9fafb;
        border: 1px solid #f3f4f6;
        border-radius: 10px;
        transition: var(--carbon-transition);
      }
      .swap-item:hover {
        background: #f0fdf4;
        border-color: rgba(16, 185, 129, 0.2);
      }
      .item-details {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
        margin-right: 12px;
      }
      .item-name {
        font-size: 13px;
        font-weight: 600;
        color: #374151;
      }
      .item-saved {
        font-size: 11px;
        color: #10b981;
        font-weight: 600;
      }
      .item-reason {
        font-size: 10px;
        color: #6b7280;
        margin-top: 2px;
        line-height: 1.3;
      }
      .swap-btn {
        background: #10b981;
        color: #ffffff;
        border: none;
        padding: 6px 12px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        transition: var(--carbon-transition);
      }
      .swap-btn:hover {
        background: #059669;
        transform: scale(1.02);
      }
      .swap-btn:active {
        transform: scale(0.98);
      }
    `
  ];

  updated(changedProperties: Map<string | number | symbol, unknown>) {
    if (changedProperties.has('sku') || changedProperties.has('apiKey') || changedProperties.has('apiHost')) {
      if (this.sku && this.apiKey) {
        this.fetchSuggestions();
      }
    }
  }

  async fetchSuggestions() {
    this.loading = true;
    this.error = false;

    try {
      const response = await fetch(
        `${this.apiHost}/v1/scores/suggestions?sku=${encodeURIComponent(this.sku)}&limit=${this.limit}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Accept': 'application/json'
          }
        }
      );

      if (!response.ok) throw new Error('Failed to load alternatives');
      const data: SuggestionsResponse = await response.json();
      this.result = data;
    } catch (e) {
      console.warn('Carbon Companion: Failed to fetch suggestions.', e);
      this.error = true;
    } finally {
      this.loading = false;
    }
  }

  triggerSwap(newSku: string) {
    this.dispatchEvent(new CustomEvent('carbon-item-swapped', {
      detail: {
        originalSku: this.sku,
        newSku: newSku
      },
      bubbles: true,
      composed: true
    }));
  }

  render() {
    if (this.loading || this.error || !this.result || this.result.suggestions.length === 0) {
      return html``; // Silent graceful degradation
    }

    return html`
      <div class="swap-card">
        <h4 class="swap-title">
          <span>💡 Lower Carbon Swaps Available</span>
        </h4>
        <div class="swap-list">
          ${this.result.suggestions.map(item => html`
            <div class="swap-item">
              <div class="item-details">
                <span class="item-name">${item.title}</span>
                <span class="item-saved">Save ${item.co2e_saved_kg.toFixed(2)} kg CO₂e</span>
                <span class="item-reason">${item.reasoning}</span>
              </div>
              <button 
                class="swap-btn"
                @click="${() => this.triggerSwap(item.sku)}"
              >
                Swap
              </button>
            </div>
          `)}
        </div>
      </div>
    `;
  }
}
