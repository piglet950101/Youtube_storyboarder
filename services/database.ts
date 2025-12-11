import { supabase } from './supabaseClient';
import { Character, Scene } from '../types';

export const createProject = async (
  title: string,
  scenario: string,
  sceneCount: number
) => {
  const { data, error } = await supabase
    .from('projects')
    .insert({
      title,
      scenario,
      scene_count: sceneCount,
      status: 'draft',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const getProjects = async () => {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
};

export const getProject = async (projectId: string) => {
  const { data, error } = await supabase
    .from('projects')
    .select(
      `
      *,
      characters(*),
      scenes(*)
      `
    )
    .eq('id', projectId)
    .single();

  if (error) throw error;
  return data;
};

export const updateProject = async (
  projectId: string,
  updates: {
    title?: string;
    scenario?: string;
    scene_count?: number;
    status?: string;
  }
) => {
  const { data, error } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', projectId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const deleteProject = async (projectId: string) => {
  const { error } = await supabase
    .from('projects')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', projectId);

  if (error) throw error;
};

export const saveCharacters = async (
  projectId: string,
  characters: Character[]
) => {
  await supabase
    .from('characters')
    .delete()
    .eq('project_id', projectId);

  const { data, error } = await supabase
    .from('characters')
    .insert(
      characters.map(char => ({
        project_id: projectId,
        name: char.name,
        role: char.role,
        visual_description: char.visualDescription,
        personality: char.personality,
        reference_image_url: char.referenceImage,
      }))
    )
    .select();

  if (error) throw error;
  return data;
};

export const saveScenes = async (projectId: string, scenes: Scene[]) => {
  const { data, error } = await supabase
    .from('scenes')
    .upsert(
      scenes.map(scene => ({
        id: scene.id,
        project_id: projectId,
        scene_number: scene.id,
        description: scene.description,
        subject_and_composition: scene.subjectAndComposition,
        setting: scene.setting,
        action: scene.action,
        emotion: scene.emotion,
        original_script_excerpt: scene.originalScriptExcerpt,
        custom_prompt: scene.customPrompt,
        generated_image_url: scene.generatedImage,
        generation_status: scene.isGenerating ? 'generating' : 'pending',
      }))
    )
    .select();

  if (error) throw error;
  return data;
};

export const uploadCharacterImage = async (
  userId: string,
  characterId: string,
  file: Blob
) => {
  const filePath = `${userId}/characters/${characterId}.png`;

  const { error } = await supabase.storage
    .from('cinegen-images')
    .upload(filePath, file, { upsert: true });

  if (error) throw error;

  const { data } = supabase.storage
    .from('cinegen-images')
    .getPublicUrl(filePath);

  return data.publicUrl;
};

export const uploadSceneImage = async (
  userId: string,
  projectId: string,
  sceneId: string,
  file: Blob
) => {
  const filePath = `${userId}/projects/${projectId}/scenes/${sceneId}.png`;

  const { error } = await supabase.storage
    .from('cinegen-images')
    .upload(filePath, file, { upsert: true });

  if (error) throw error;

  const { data } = supabase.storage
    .from('cinegen-images')
    .getPublicUrl(filePath);

  return data.publicUrl;
};

export const logTokenTransaction = async (
  userId: string,
  amount: number,
  transactionType: string,
  description: string,
  balanceBefore: number,
  balanceAfter: number
) => {
  const { error } = await supabase
    .from('token_transactions')
    .insert({
      user_id: userId,
      amount,
      transaction_type: transactionType,
      description,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
    });

  if (error) throw error;
};

export const consumeTokens = async (userId: string, amount: number) => {
  const { data: userData, error: fetchError } = await supabase
    .from('users')
    .select('token_balance')
    .eq('id', userId)
    .single();

  if (fetchError) throw fetchError;

  const newBalance = userData.token_balance - amount;

  if (newBalance < 0) {
    throw new Error('Insufficient tokens');
  }

  const { error: updateError } = await supabase
    .from('users')
    .update({ token_balance: newBalance })
    .eq('id', userId);

  if (updateError) throw updateError;

  await logTokenTransaction(
    userId,
    -amount,
    'consumption',
    'Image generation',
    userData.token_balance,
    newBalance
  );

  return newBalance;
};
