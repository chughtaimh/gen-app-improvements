"use client";
import React from 'react';
import { loginWithGoogle, logout, useUser } from '@/lib/firebase/auth';

export default function Home() {
  const { user, loading } = useUser();

  return (
    <main className="min-h-screen flex-col flex-center" style={{ padding: '0 2rem', paddingTop: '100px' }}>
      {/* Navbar overlay */}
      <nav className="navbar">
        <div className="nav-logo">UX AI AGENT</div>
        {!loading && (
          <div>
            {user ? (
              <div className="flex-row items-center gap-4">
                <span className="text-sm" style={{ color: '#888' }}>{user.email}</span>
                <button onClick={logout} className="text-sm" style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer' }}>Sign Out</button>
              </div>
            ) : (
              <button
                onClick={loginWithGoogle}
                className="btn-outline btn"
                style={{ borderRadius: '20px', padding: '0.5rem 1rem', fontSize: '0.9rem' }}
              >
                Sign In
              </button>
            )}
          </div>
        )}
      </nav>

      {/* Hero Content */}
      <div className="text-center animate-in" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ display: 'inline-block', padding: '0.25rem 0.75rem', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '99px', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1.5rem', color: '#ccc' }}>
          AI-Powered Product Analyst
        </div>

        <h1>
          Evaluate your product <br />
          <span className="text-gradient">in seconds, not weeks.</span>
        </h1>

        <p style={{ margin: '0 auto 2rem auto', fontSize: '1.2rem' }}>
          Deploy an autonomous AI agent to navigate your site, analyze UX friction,
          and generate a comprehensive product report with actionable improvements.
        </p>

        <div className="flex-center gap-4 flex-col-mobile" style={{ marginTop: '2rem', flexWrap: 'wrap' }}>
          {user ? (
            <button
              onClick={() => window.location.href = '/dashboard'}
              className="btn btn-primary"
              style={{ padding: '1rem 2.5rem', fontSize: '1.1rem' }}
            >
              Start New Evaluation
            </button>
          ) : (
            <button
              onClick={loginWithGoogle}
              className="btn btn-primary"
              style={{ padding: '1rem 2.5rem', fontSize: '1.1rem' }}
            >
              Sign In to Start
            </button>
          )}

          <button className="btn btn-outline" style={{ padding: '1rem 2.5rem', fontSize: '1.1rem' }}>
            View Sample Report
          </button>
        </div>
      </div>

      {/* Feature Cards */}
      <div className="grid-cols-3 w-full" style={{ maxWidth: '1100px', marginTop: '6rem' }}>
        {[
          { title: "Smart Navigation", desc: "Our agent explores your app like a real user, clicking, scrolling, and interacting." },
          { title: "Multimodal Analysis", desc: "Gemini 1.5 Pro analyzes video & screenshots to understand design intent." },
          { title: "Actionable Plan", desc: "Receive a prioritized list of tasks, ready to export to your issue tracker." }
        ].map((item, i) => (
          <div key={i} className="glass-card">
            <h3>{item.title}</h3>
            <p className="text-sm">{item.desc}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
