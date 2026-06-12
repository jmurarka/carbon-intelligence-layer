import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const router = useRouter();

  const isActive = (path: string) => router.pathname === path;

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar Navigation */}
      <aside style={{
        width: '260px',
        backgroundColor: '#0f1422',
        borderRight: '1px solid rgba(255, 255, 255, 0.05)',
        padding: '30px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '40px',
        position: 'sticky',
        top: 0,
        height: '100vh'
      }}>
        {/* Brand Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <svg style={{ width: '28px', height: '28px', fill: '#10b981' }} viewBox="0 0 24 24">
            <path d="M17 8C8 10 5.9 16.17 3.8 21c4-.2 9.9-1.68 15-7.22 3.96-4.3 2-10.78 2-10.78S17.8 5 17 8zM6 18c0-3.3 2.7-6 6-6s6 2.7 6 6-2.7 6-6 6-6-2.7-6-6z" opacity=".15"/>
            <path d="M2 22c0-5.52 4.48-10 10-10 1.93 0 3.72.55 5.25 1.5L20 10.75C20.67 9.17 21 7.33 21 5.37c0-2.42-1.96-4.37-4.38-4.37-2.92 0-5.5 1.5-6.9 3.75L6.25 1.25C4.75 2.78 4.2 4.57 4.2 6.5c0 5.52 4.48 10 10 10 .85 0 1.67-.1 2.47-.3L13.7 20.3C13.15 20.75 12.6 21 12 21c-5.52 0-10-4.48-10-10zM12 2c5.52 0 10 4.48 10 10s-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2z" />
          </svg>
          <span style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '0.5px' }}>
            Carbon<span style={{ color: '#10b981' }}>Companion</span>
          </span>
        </div>

        {/* Navigation Menu */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
          <Link href="/" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 16px',
            borderRadius: '10px',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: 600,
            color: isActive('/') ? '#ffffff' : '#94a3b8',
            backgroundColor: isActive('/') ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
            border: isActive('/') ? '1px solid rgba(16, 185, 129, 0.15)' : '1px solid transparent',
            transition: 'all 0.2s ease-in-out'
          }}>
            📊 Analytics Dashboard
          </Link>

          <Link href="/overrides" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 16px',
            borderRadius: '10px',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: 600,
            color: isActive('/overrides') ? '#ffffff' : '#94a3b8',
            backgroundColor: isActive('/overrides') ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
            border: isActive('/overrides') ? '1px solid rgba(16, 185, 129, 0.15)' : '1px solid transparent',
            transition: 'all 0.2s ease-in-out'
          }}>
            🎛️ Catalog Overrides
          </Link>
        </nav>

        {/* Bottom Partner Badge */}
        <div style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.04)',
          borderRadius: '12px',
          padding: '14px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Active Partner</div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc', marginTop: '4px' }}>Green E-Shop</div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main style={{
        flex: 1,
        padding: '40px',
        backgroundColor: '#0b0f19',
        overflowY: 'auto',
        height: '100vh'
      }}>
        {children}
      </main>
    </div>
  );
}
