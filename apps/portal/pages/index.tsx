import React from 'react';
import { GetServerSideProps } from 'next';
import { prisma } from '../lib/prisma';
import Layout from '../components/layout';

interface DashboardProps {
  productCount: number;
  overrideCount: number;
  recentProducts: Array<{
    sku: string;
    title: string;
    categoryName: string;
    weightGrams: number;
  }>;
  recentOverrides: Array<{
    sku: string | null;
    customFactor: number;
    justification: string | null;
    categoryName: string | null;
  }>;
}

export default function Dashboard({
  productCount,
  overrideCount,
  recentProducts,
  recentOverrides
}: DashboardProps) {
  // Simulating dashboard KPIs
  const mockCarbonSaved = 284.12;
  const mockImpressions = 12450;
  const mockSwapRate = 22.4;

  return (
    <Layout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
        {/* Welcome Section */}
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 800 }} className="gradient-text">Dashboard Overview</h1>
          <p style={{ color: '#94a3b8', fontSize: '14px', marginTop: '6px' }}>
            Real-time analytics and carbon-intelligence management for your e-commerce channels.
          </p>
        </div>

        {/* KPI Widget Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
          <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>🌱 Carbon Saved</span>
            <div style={{ fontSize: '28px', fontWeight: 800, color: '#10b981' }}>{mockCarbonSaved.toFixed(2)} kg</div>
            <span style={{ fontSize: '11px', color: '#64748b' }}>+12.4% from last week</span>
          </div>

          <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>👁️ Widget Impressions</span>
            <div style={{ fontSize: '28px', fontWeight: 800, color: '#38bdf8' }}>{mockImpressions.toLocaleString()}</div>
            <span style={{ fontSize: '11px', color: '#64748b' }}>Across all product pages</span>
          </div>

          <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>🔄 Eco-Swap Success</span>
            <div style={{ fontSize: '28px', fontWeight: 800, color: '#f59e0b' }}>{mockSwapRate}%</div>
            <span style={{ fontSize: '11px', color: '#64748b' }}>Cart alternative switches</span>
          </div>

          <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>📦 Catalog Items</span>
            <div style={{ fontSize: '28px', fontWeight: 800, color: '#f8fafc' }}>{productCount}</div>
            <span style={{ fontSize: '11px', color: '#64748b' }}>Active SKU maps in DB</span>
          </div>
        </div>

        {/* Charts & Graphs (Simulated using CSS Flexbox) */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700 }}>Weekly Carbon Avoided Trends</h3>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            height: '140px',
            paddingTop: '20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
          }}>
            {[
              { day: 'Mon', val: 32 },
              { day: 'Tue', val: 45 },
              { day: 'Wed', val: 68 },
              { day: 'Thu', val: 55 },
              { day: 'Fri', val: 89 },
              { day: 'Sat', val: 110 },
              { day: 'Sun', val: 95 }
            ].map(item => (
              <div key={item.day} style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
                flex: 1
              }}>
                <div style={{
                  width: '30px',
                  height: `${item.val}px`,
                  background: 'linear-gradient(to top, #059669, #10b981)',
                  borderRadius: '4px 4px 0 0',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.15)'
                }}></div>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>{item.day}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Data Grid Summary Tables */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
          
          {/* Table: Recent Products */}
          <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700 }}>Recent Catalog Additions</h3>
              <span style={{ fontSize: '11px', color: '#94a3b8', background: 'rgba(255,255,255,0.03)', padding: '4px 8px', borderRadius: '4px' }}>Last 5</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ color: '#94a3b8', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <th style={{ padding: '10px 0' }}>SKU</th>
                  <th>Product</th>
                  <th>Category</th>
                  <th style={{ textAlign: 'right' }}>Weight</th>
                </tr>
              </thead>
              <tbody>
                {recentProducts.map(prod => (
                  <tr key={prod.sku} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                    <td style={{ padding: '12px 0', fontFamily: 'monospace', color: '#38bdf8' }}>{prod.sku}</td>
                    <td style={{ fontWeight: 600 }}>{prod.title}</td>
                    <td style={{ color: '#94a3b8' }}>{prod.categoryName}</td>
                    <td style={{ textAlign: 'right' }}>{prod.weightGrams}g</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Table: Recent Overrides */}
          <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700 }}>Recent Overrides</h3>
              <span style={{ fontSize: '11px', color: '#94a3b8', background: 'rgba(255,255,255,0.03)', padding: '4px 8px', borderRadius: '4px' }}>Active</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ color: '#94a3b8', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <th style={{ padding: '10px 0' }}>SKU / Category</th>
                  <th>Factor</th>
                  <th>Justification</th>
                </tr>
              </thead>
              <tbody>
                {recentOverrides.map((ov, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                    <td style={{ padding: '12px 0', fontWeight: 600 }}>
                      {ov.sku ? (
                        <span style={{ fontFamily: 'monospace', color: '#fb7185' }}>{ov.sku}</span>
                      ) : (
                        <span>📂 {ov.categoryName}</span>
                      )}
                    </td>
                    <td style={{ color: '#10b981', fontWeight: 700 }}>{ov.customFactor} kg</td>
                    <td style={{ color: '#94a3b8', fontStyle: 'italic' }}>{ov.justification || 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      </div>
    </Layout>
  );
}

export const getServerSideProps: GetServerSideProps = async () => {
  try {
    const productCount = await prisma.productCatalog.count();
    const overrideCount = await prisma.partnerOverride.count();

    const dbProducts = await prisma.productCatalog.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: { category: true }
    });

    const dbOverrides = await prisma.partnerOverride.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: { category: true }
    });

    const recentProducts = dbProducts.map(p => ({
      sku: p.sku,
      title: p.title,
      categoryName: p.category.name,
      weightGrams: (p.attributes as any)?.weight_grams || 0
    }));

    const recentOverrides = dbOverrides.map(o => ({
      sku: o.sku,
      customFactor: Number(o.customFactor),
      justification: o.justification,
      categoryName: o.category ? o.category.name : null
    }));

    return {
      props: {
        productCount,
        overrideCount,
        recentProducts,
        recentOverrides
      }
    };
  } catch (error) {
    console.error('getServerSideProps DB Fetch Error:', error);
    return {
      props: {
        productCount: 0,
        overrideCount: 0,
        recentProducts: [],
        recentOverrides: []
      }
    };
  }
};
