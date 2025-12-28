'use server';

import { revalidatePath } from 'next/cache';

export async function rerunProject(projectId) {
    if (!projectId) return { error: 'Project ID is required' };

    try {
        // We only revalidate the path here. 
        // The actual data update happens on the client side to ensure Auth works with Client SDK.
        revalidatePath(`/projects/${projectId}`);
        revalidatePath('/dashboard');

        return { success: true };
    } catch (error) {
        console.error('Error revalidating project:', error);
        return { error: 'Failed to revalidate' };
    }
}
