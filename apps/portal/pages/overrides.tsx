import React, { useState } from 'react';
import { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { prisma } from '../lib/prisma';
import Layout from '../components/layout';

interface CategoryData {
  categoryId: string;
  name: string;
}

interface OverrideItem {
  overrideId: string;
  sku: string | null;
  customFactor: number;
  justification: string | null;
  categoryName: string | null;
  createdAt: string;
}

interface OverridesProps {
  categories: CategoryData[];
  overrides: OverrideItem[];
}

export default function Overrides({ categories, overrides }: OverridesProps) {
  const router = useRouter();
  const partnerId = 'a0f7c222-38b8-4d57-814d-61c02b11ea99'; // Green E-Shop UUID from seed

  // Form State
  const [type, setType] = useState<'sku' | 'category'>('sku');
  const [sku, setSku] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [customFactor, setCustomFactor] = useState('');
  const [justification, setJustification] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmitting = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    const payload = {
      partnerId,
      sku: type === 'sku' ? sku : undefined,
      categoryId: type === 'category' ? categoryId : undefined,
      customFactor: Number(customFactor),
      justification
    };

    try {
      const res = await fetch('/api/overrides', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to submit override');
      }

      // Success, clear form and reload server props
      setSku('');
      setCategoryId('');
      setCustomFactor('');
      setJustification('');
      router.replace(router.asPath);
    } catch (err: any) {
      setErrorMsg(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 800 }} className="gradient-text">Catalog Overrides</h1>
          <p style={{ color: '#94a3b8', fontSize: '14px', marginTop: '6px' }}>
            Set custom emission factors for specific products or entire categories. Overrides bypass default LCA factors.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1.2fr 2fr',
          gap: '30px',
          alignItems: 'flex-start'
        }}>
          {/* Create Override Form */}
          <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700 }}>Add Custom Override</h3>
            
            {errorMsg && (
              <div style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                color: '#f87171',
                padding: '10px',
                borderRadius: '8px',
                fontSize: '13px'
              }}>
                ❌ {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmitting} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>Override Scope</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setType('sku')}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '6px',
                      border: '1px solid',
                      fontSize: '13px',
                      fontWeight: 600,
                      backgroundColor: type === 'sku' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(0, 0, 0, 0.2)',
                      borderColor: type === 'sku' ? '#10b981' : 'rgba(255, 255, 255, 0.05)',
                      color: type === 'sku' ? '#ffffff' : '#94a3b8',
                    }}
                  >
                    Product SKU
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('category')}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '6px',
                      border: '1px solid',
                      fontSize: '13px',
                      fontWeight: 600,
                      backgroundColor: type === 'category' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(0, 0, 0, 0.2)',
                      borderColor: type === 'category' ? '#10b981' : 'rgba(255, 255, 255, 0.05)',
                      color: type === 'category' ? '#ffffff' : '#94a3b8',
                    }}
                  >
                    Category-Wide
                  </button>
                </div>
              </div>

              {type === 'sku' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label htmlFor="input-sku" style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>Product SKU</label>
                  <input
                    id="input-sku"
                    type="text"
                    placeholder="e.g., sku-almondmilk-002"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    required={type === 'sku'}
                  />
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label htmlFor="input-category" style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>Category</label>
                  <select
                    id="input-category"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    required={type === 'category'}
                  >
                    <option value="" disabled>Select category...</option>
                    {categories.map((c) => (
                      <option key={c.categoryId} value={c.categoryId}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label htmlFor="input-factor" style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>Custom Factor (kg CO₂e per kg)</label>
                <input
                  id="input-factor"
                  type="number"
                  step="0.0001"
                  placeholder="e.g., 0.3500"
                  value={customFactor}
                  onChange={(e) => setCustomFactor(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label htmlFor="input-justification" style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>Justification / Notes</label>
                <textarea
                  id="input-justification"
                  rows={3}
                  placeholder="Justify why this custom value is used..."
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  style={{
                    backgroundColor: '#0f1322',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    borderRadius: '8px',
                    color: '#f8fafc',
                    padding: '10px 14px',
                    fontFamily: 'inherit',
                    fontSize: '14px',
                    resize: 'none'
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: '#ffffff',
                  fontWeight: 700,
                  border: 'none',
                  padding: '12px',
                  borderRadius: '8px',
                  marginTop: '10px',
                  fontSize: '14px',
                  opacity: loading ? 0.6 : 1,
                  cursor: loading ? 'not-allowed' : 'pointer'
                }}
              >
                {loading ? 'Creating...' : 'Create Override Rule'}
              </button>
            </form>
          </div>

          {/* Active Overrides Table */}
          <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700 }}>Active Override Rules</h3>
            {overrides.length === 0 ? (
              <p style={{ color: '#94a3b8', fontSize: '14px', fontStyle: 'italic', textAlign: 'center', padding: '40px 0' }}>
                No active overrides defined yet. Use the form on the left to set custom rules.
              </p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ color: '#94a3b8', borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <th style={{ padding: '10px 0' }}>Scope</th>
                    <th>Custom Factor</th>
                    <th>Justification</th>
                    <th style={{ textAlign: 'right' }}>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {overrides.map((ov) => (
                    <tr key={ov.overrideId} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.02)' }}>
                      <td style={{ padding: '14px 0', fontWeight: 600 }}>
                        {ov.sku ? (
                          <span style={{ fontFamily: 'monospace', color: '#fb7185' }}>{ov.sku}</span>
                        ) : (
                          <span>📂 {ov.categoryName}</span>
                        )}
                      </td>
                      <td style={{ color: '#10b981', fontWeight: 700 }}>{ov.customFactor.toFixed(4)} kg</td>
                      <td style={{ color: '#94a3b8', fontStyle: 'italic', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ov.justification || ''}>
                        {ov.justification || 'N/A'}
                      </td>
                      <td style={{ textAlign: 'right', color: '#64748b', fontSize: '11px' }}>
                        {new Date(ov.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}

export const getServerSideProps: GetServerSideProps = async () => {
  try {
    const dbCategories = await prisma.category.findMany({
      orderBy: { name: 'asc' },
    });

    const dbOverrides = await prisma.partnerOverride.findMany({
      orderBy: { createdAt: 'desc' },
      include: { category: true },
    });

    const categories = dbCategories.map((c) => ({
      categoryId: c.categoryId,
      name: c.name,
    }));

    const overrides = dbOverrides.map((o) => ({
      overrideId: o.overrideId,
      sku: o.sku,
      customFactor: Number(o.customFactor),
      justification: o.justification,
      categoryName: o.category ? o.category.name : null,
      createdAt: o.createdAt.toISOString(),
    }));

    return {
      props: {
        categories,
        overrides,
      },
    };
  } catch (error) {
    console.error('getServerSideProps DB fetch error:', error);
    return {
      props: {
        categories: [],
        overrides: [],
      },
    };
  }
};
