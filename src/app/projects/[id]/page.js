"use client";
import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase/config';
import { doc, onSnapshot } from 'firebase/firestore';
import { useUser } from '@/lib/firebase/auth';
import { rerunProject } from '@/app/actions/rerunProject';

export default function ProjectPage() {
    const { id } = useParams();
    const { user } = useUser();
    const router = useRouter();
    const [project, setProject] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!id) return;

        const unsubscribe = onSnapshot(doc(db, "projects", id), (docFn) => {
            if (docFn.exists()) {
                const data = docFn.data();
                setProject(data);
                // Security: If userId doesn't match, redirect (basic client-side check)
                if (user && data.userId !== user.uid) {
                    // allow viewing if it's public (future feature), else redirect
                    router.push('/dashboard');
                }
            } else {
                router.push('/dashboard?error=not_found');
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, [id, user, router]);

    if (loading || !project) return <div className="min-h-screen grid place-items-center text-white">Loading Project...</div>;

    const steps = [
        { key: 'queued', label: 'Queued', desc: 'Waiting for available agent...' },
        { key: 'navigating', label: 'Navigating', desc: 'Agent is exploring the site...' },
        { key: 'analyzing', label: 'Analyzing', desc: 'Gemini is evaluating UX patterns...' },
        { key: 'completed', label: 'Report Ready', desc: 'Evaluation complete.' }
    ];

    const currentStepIndex = steps.findIndex(s => s.key === project.status) === -1
        ? (project.status === 'failed' ? -1 : 0) // Default to 0 if unknown
        : steps.findIndex(s => s.key === project.status);

    return (
        <div className="container" style={{ padding: '2rem', paddingTop: '6rem' }}>
            {/* Header */}
            <div className="flex-row justify-between items-start animate-in" style={{ marginBottom: '3rem' }}>
                <div>
                    <button onClick={() => router.push('/dashboard')} className="text-sm" style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', marginBottom: '0.5rem' }}>← Back to Dashboard</button>
                    <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{project.url}</h1>
                    <p>{project.description || 'No description provided.'}</p>
                </div>
                <div className={`badge ${project.status === 'completed' ? 'badge-success' :
                    project.status === 'failed' ? 'badge-error' :
                        'badge-info'
                    }`}>
                    STATUS: {project.status.toUpperCase()}
                </div>
            </div>

            <div style={{ marginBottom: '2rem' }}>
                {(project.status === 'completed' || project.status === 'failed') && (
                    <button
                        onClick={async () => {
                            if (confirm('Are you sure you want to re-run this evaluation?')) {
                                setLoading(true); // Optimistic UI
                                await rerunProject(project.id || id);
                                // The snapshot listener will pick up the change to 'queued'
                            }
                        }}
                        className="btn-primary" // Assuming this class exists or similar style
                        style={{ padding: '0.5rem 1rem', background: '#3b82f6', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer' }}
                    >
                        ↻ Re-run Evaluation
                    </button>
                )}
            </div>

            {project.status === 'failed' && (
                <div className="glass-card badge-error" style={{ marginBottom: '2rem', color: '#f87171' }}>
                    <h3 className="mb-2">Evaluation Failed</h3>
                    <p>The agent encountered an error: {project.error || 'Unknown error'}</p>
                </div>
            )}

            {/* Progress Stepper */}
            {project.status !== 'completed' && project.status !== 'failed' && (
                <div className="glass-card flex-center" style={{ position: 'relative', marginBottom: '2rem', padding: '3rem' }}>
                    {/* Steps UI */}
                    <div className="w-full flex-row justify-between" style={{ position: 'relative', zIndex: 10 }}>
                        {steps.map((step, i) => {
                            const isActive = i === currentStepIndex;
                            const isDone = i < currentStepIndex;
                            return (
                                <div key={step.key} className="flex-col items-center" style={{ flex: 1, opacity: isActive || isDone ? 1 : 0.3, transition: 'all 0.5s' }}>
                                    <div className="flex-center" style={{
                                        width: '40px', height: '40px', borderRadius: '50%', marginBottom: '1rem',
                                        background: isDone ? '#22c55e' : isActive ? '#3b82f6' : '#333',
                                        color: isDone ? 'black' : 'white',
                                        transform: isActive ? 'scale(1.2)' : 'scale(1)',
                                        transition: 'all 0.5s',
                                        boxShadow: isActive ? '0 0 20px rgba(59,130,246,0.5)' : 'none'
                                    }}>
                                        {isDone ? '✓' : i + 1}
                                    </div>
                                    <div className="text-center">
                                        <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>{step.label}</div>
                                        <div className="text-xs" style={{ color: '#888' }}>{step.desc}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {/* Connecting Line */}
                    <div style={{ position: 'absolute', top: '4.5rem', left: '0', width: '100%', height: '2px', background: '#333', zIndex: 0 }}>
                        <div style={{ height: '100%', background: '#3b82f6', width: `${(currentStepIndex / (steps.length - 1)) * 100}%`, transition: 'all 1s' }}></div>
                    </div>
                </div>
            )}

            {/* Report View */}
            {project.status === 'completed' && project.report && (
                <div className="animate-in flex-col gap-8">
                    {/* Metrics Grid */}
                    <div className="grid-cols-3" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                        <div className="glass-card">
                            <div className="text-xs badge" style={{ marginBottom: '0.5rem', background: 'rgba(255,255,255,0.05)', color: '#888' }}>UX Score</div>
                            <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: project.report.score >= 80 ? '#4ade80' : project.report.score >= 50 ? '#facc15' : '#f87171' }}>
                                {project.report.score || 0}<span className="text-sm" style={{ color: '#666', marginLeft: '0.25rem' }}>/100</span>
                            </div>
                        </div>
                        <div className="glass-card">
                            <div className="text-xs badge" style={{ marginBottom: '0.5rem', background: 'rgba(255,255,255,0.05)', color: '#888' }}>Intent</div>
                            <div className="text-sm" style={{ color: '#bae6fd', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                {project.report.intent || project.description || 'Inferred'}
                            </div>
                        </div>
                        <div className="glass-card">
                            <div className="text-xs badge" style={{ marginBottom: '0.5rem', background: 'rgba(255,255,255,0.05)', color: '#888' }}>Issues</div>
                            <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#fb923c' }}>
                                {project.report.uxIssues?.length || 0}
                            </div>
                        </div>
                        <div className="glass-card">
                            <div className="text-xs badge" style={{ marginBottom: '0.5rem', background: 'rgba(255,255,255,0.05)', color: '#888' }}>Actions</div>
                            <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#60a5fa' }}>
                                {project.report.opportunities?.length || 0}
                            </div>
                        </div>
                    </div>

                    {/* AI Summary */}
                    <div className="glass-card">
                        <h2 className="text-xl" style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Executive Summary</h2>
                        <p style={{ fontSize: '1.1rem', color: '#ccc' }}>
                            {project.report.summary}
                        </p>
                    </div>

                    {/* Issues & Opportunities */}
                    <div className="grid-cols-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
                        {/* Issues List */}
                        <div>
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f87171' }}>
                                Friction Points
                            </h3>
                            <div className="flex-col gap-4">
                                {project.report.uxIssues?.map((issue, i) => (
                                    <div key={i} className="glass-card" style={{ padding: '1.25rem', borderLeft: '4px solid rgba(248, 113, 113, 0.5)' }}>
                                        <div className="flex-row justify-between items-start mb-1">
                                            <h4 style={{ fontWeight: 'bold', fontSize: '0.9rem', color: 'white' }}>{issue.title || 'UX Issue'}</h4>
                                            {issue.severity && (
                                                <span className={`badge ${issue.severity === 'high' ? 'badge-error' : 'badge-info'}`} style={{ fontSize: '0.6rem' }}>
                                                    {issue.severity}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm">{issue.description}</p>
                                    </div>
                                ))}
                                {!project.report.uxIssues?.length && <div style={{ color: '#666', fontStyle: 'italic' }}>No major issues found.</div>}
                            </div>
                        </div>

                        {/* Opportunities List */}
                        <div>
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#4ade80' }}>
                                Opportunities
                            </h3>
                            <div className="flex-col gap-4">
                                {project.report.opportunities?.map((opp, i) => (
                                    <div key={i} className="glass-card" style={{ padding: '1.25rem', borderLeft: '4px solid rgba(74, 222, 128, 0.5)' }}>
                                        <p className="text-sm" style={{ color: '#d1d5db' }}>{typeof opp === 'string' ? opp : opp.title}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
