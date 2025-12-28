"use client";
import React, { useEffect, useState } from 'react';
import { useUser } from '@/lib/firebase/auth';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase/config';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import CreateProjectForm from '@/components/CreateProjectForm';

export default function Dashboard() {
    const { user, loading } = useUser();
    const router = useRouter();
    const [projects, setProjects] = useState([]);
    const [showForm, setShowForm] = useState(false);

    useEffect(() => {
        if (!loading && !user) {
            router.push('/');
        }
    }, [user, loading, router]);

    // Fetch Projects in Realtime
    useEffect(() => {
        if (!user) return;

        const q = query(
            collection(db, "projects"),
            where("userId", "==", user.uid),
            orderBy("createdAt", "desc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const projs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setProjects(projs);
        });

        return () => unsubscribe();
    }, [user]);

    if (loading) return <div className="min-h-screen grid place-items-center">Loading...</div>;

    return (
        <div className="container" style={{ padding: '2rem', paddingTop: '6rem' }}>
            <nav className="navbar">
                <div className="nav-logo" onClick={() => router.push('/')}>UX AGENT</div>
                <div className="flex-center gap-4">
                    <button onClick={() => setShowForm(!showForm)} className="btn btn-primary" style={{ padding: '0.5rem 1.5rem', fontSize: '0.9rem' }}>
                        {showForm ? 'Cancel' : '+ New Evaluation'}
                    </button>
                </div>
            </nav>

            {showForm ? (
                <CreateProjectForm />
            ) : (
                <div className="animate-in">
                    <div className="flex-row justify-between items-start" style={{ borderBottom: '1px solid var(--card-border)', paddingBottom: '1rem', marginBottom: '2rem' }}>
                        <div>
                            <h2>Your Evaluations</h2>
                            <p>Manage and track your AI agent runs.</p>
                        </div>
                        <div className="text-sm" style={{ color: '#666' }}>
                            {user?.email} • <span style={{ color: '#60a5fa', textTransform: 'capitalize' }}>{user?.plan || 'pro'} Plan</span>
                        </div>
                    </div>

                    {projects.length === 0 ? (
                        <div className="text-center" style={{ padding: '5rem 0', border: '1px dashed var(--card-border)', borderRadius: '16px', background: 'rgba(255,255,255,0.02)' }}>
                            <h3 className="mb-2">No evaluations yet</h3>
                            <p style={{ margin: '0 auto 1.5rem auto' }}>Launch your first agent to analyze a product. It takes about 2-3 minutes.</p>
                            <button onClick={() => setShowForm(true)} className="btn btn-primary">Start First Evaluation</button>
                        </div>
                    ) : (
                        <div className="grid-cols-3">
                            {projects.map((p) => (
                                <div key={p.id} className="glass-card" onClick={() => router.push(`/projects/${p.id}`)} style={{ cursor: 'pointer', padding: '1.5rem' }}>
                                    <div className="flex-row justify-between items-center mb-4">
                                        <span className={`badge ${p.status === 'completed' ? 'badge-success' :
                                                p.status === 'failed' ? 'badge-error' :
                                                    'badge-info'
                                            }`}>
                                            {p.status}
                                        </span>
                                        <span className="text-xs" style={{ color: '#666' }}>{p.createdAt?.toDate().toLocaleDateString()}</span>
                                    </div>
                                    <h3 style={{ fontSize: '1.25rem', marginBottom: '0.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.url}</h3>
                                    <p className="text-sm" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.description || 'No description provided.'}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
