"use client";
import React, { useState } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useUser } from '@/lib/firebase/auth';
import { useRouter } from 'next/navigation';

export default function CreateProjectForm() {
    const { user } = useUser();
    const router = useRouter();
    const [url, setUrl] = useState('');
    const [description, setDescription] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!user) return;

        // Basic validation
        if (!url.startsWith('http')) {
            setError('Please enter a valid URL (starting with http:// or https://)');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // Create Project with 'queued' status
            const docRef = await addDoc(collection(db, "projects"), {
                userId: user.uid,
                url,
                description, // Optional
                status: 'queued', // Worker will pick this up
                createdAt: serverTimestamp(),
                // Default settings for now
                isPremium: false,
                auth: {
                    email: email || null,
                    password: password || null
                }
            });

            console.log("Project created with ID: ", docRef.id);
            router.push(`/projects/${docRef.id}`); // Redirect to status page
        } catch (err) {
            console.error("Error adding document: ", err);
            setError('Failed to create project. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="glass-card animate-in" style={{ maxWidth: '600px', margin: '0 auto', padding: '2rem' }}>
            <h2 style={{ borderBottom: '1px solid var(--card-border)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>Start New Evaluation</h2>

            <form onSubmit={handleSubmit} className="flex-col gap-4">
                {/* URL Input */}
                <div className="flex-col gap-2">
                    <label htmlFor="url" className="text-sm" style={{ fontWeight: '500', color: '#ccc' }}>Target URL</label>
                    <input
                        id="url"
                        type="url"
                        placeholder="https://example.com"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        required
                        className="input-field"
                    />
                </div>

                {/* Description Input */}
                <div className="flex-col gap-2">
                    <label htmlFor="desc" className="text-sm" style={{ fontWeight: '500', color: '#ccc' }}>
                        Description <span style={{ fontSize: '0.8em', color: '#666' }}>(Optional - AI will infer intent)</span>
                    </label>
                    <textarea
                        id="desc"
                        rows={4}
                        placeholder="Describe your product's goal..."
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="input-field"
                        style={{ resize: 'none' }}
                    />
                </div>

                {/* Advanced Options Toggle */}
                <div style={{ marginTop: '0.5rem' }}>
                    <button
                        type="button"
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="text-sm flex-center"
                        style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', padding: 0 }}
                    >
                        {showAdvanced ? 'Hide Advanced Options ▲' : 'Show Advanced Options +'}
                    </button>

                    {showAdvanced && (
                        <div className="animate-in" style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                            <h4 className="text-sm" style={{ marginBottom: '1rem', color: '#ccc' }}>Authentication Credentials (Optional)</h4>
                            <div className="flex-col gap-3">
                                <div className="flex-col gap-1">
                                    <label htmlFor="email" className="text-xs" style={{ color: '#888' }}>Email / Username</label>
                                    <input
                                        id="email"
                                        type="text"
                                        placeholder="user@example.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="input-field"
                                    />
                                </div>
                                <div className="flex-col gap-1">
                                    <label htmlFor="password" className="text-xs" style={{ color: '#888' }}>Password</label>
                                    <input
                                        id="password"
                                        type="password"
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="input-field"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {error && (
                    <div className="badge badge-error" style={{ display: 'block', textAlign: 'center', padding: '1rem' }}>
                        {error}
                    </div>
                )}

                {/* Submit Button */}
                <button
                    type="submit"
                    disabled={loading || !user}
                    className="btn btn-primary w-full"
                    style={{ marginTop: '1rem', opacity: loading ? 0.7 : 1 }}
                >
                    {loading ? 'Initializing Agent...' : 'Launch Evaluation'}
                </button>
            </form>
        </div>
    );
}
