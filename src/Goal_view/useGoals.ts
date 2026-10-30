import { useState } from 'react';
import type { Goal } from './goal';

const STORAGE_KEY = 'goals-store';

const generateId = () => Math.random().toString(36).slice(2, 8);

const loadGoals = (): Goal[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const useGoals = () => {
  const [goals, setGoals] = useState<Goal[]>(loadGoals);

  const save = (updated: Goal[]) => {
    setGoals(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  const addGoal = (goal: Omit<Goal, 'id'>) => {
    save([...goals, { ...goal, id: generateId() }]);
  };

  const updateGoal = (id: string, updates: Partial<Goal>) => {
    save(goals.map(g => g.id === id ? { ...g, ...updates } : g));
  };

  const deleteGoal = (id: string) => {
    save(goals.filter(g => g.id !== id));
  };

  return { goals, addGoal, updateGoal, deleteGoal };
};
