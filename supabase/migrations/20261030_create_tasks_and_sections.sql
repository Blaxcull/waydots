-- Migration: Create tasks and task_sections tables with RLS and indexes

-- 1. Create task_sections table
CREATE TABLE IF NOT EXISTS public.task_sections (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    view TEXT NOT NULL DEFAULT 'inbox',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create tasks table
CREATE TABLE IF NOT EXISTS public.tasks (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    section_id TEXT REFERENCES public.task_sections(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    view TEXT NOT NULL DEFAULT 'inbox',
    due_date TEXT,
    due_time TEXT,
    subtasks JSONB DEFAULT '[]'::jsonb,
    completed BOOLEAN NOT NULL DEFAULT false,
    priority TEXT DEFAULT 'medium',
    notes TEXT DEFAULT '',
    linked_email_id TEXT,
    linked_email_subject TEXT,
    linked_event_id TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.task_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies for task_sections
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'task_sections' AND policyname = 'Users can view their own task sections'
    ) THEN
        CREATE POLICY "Users can view their own task sections"
            ON public.task_sections FOR SELECT
            USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'task_sections' AND policyname = 'Users can insert their own task sections'
    ) THEN
        CREATE POLICY "Users can insert their own task sections"
            ON public.task_sections FOR INSERT
            WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'task_sections' AND policyname = 'Users can update their own task sections'
    ) THEN
        CREATE POLICY "Users can update their own task sections"
            ON public.task_sections FOR UPDATE
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'task_sections' AND policyname = 'Users can delete their own task sections'
    ) THEN
        CREATE POLICY "Users can delete their own task sections"
            ON public.task_sections FOR DELETE
            USING (auth.uid() = user_id);
    END IF;
END $$;

-- 5. Create RLS Policies for tasks
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'tasks' AND policyname = 'Users can view their own tasks'
    ) THEN
        CREATE POLICY "Users can view their own tasks"
            ON public.tasks FOR SELECT
            USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'tasks' AND policyname = 'Users can insert their own tasks'
    ) THEN
        CREATE POLICY "Users can insert their own tasks"
            ON public.tasks FOR INSERT
            WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'tasks' AND policyname = 'Users can update their own tasks'
    ) THEN
        CREATE POLICY "Users can update their own tasks"
            ON public.tasks FOR UPDATE
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'tasks' AND policyname = 'Users can delete their own tasks'
    ) THEN
        CREATE POLICY "Users can delete their own tasks"
            ON public.tasks FOR DELETE
            USING (auth.uid() = user_id);
    END IF;
END $$;

-- 6. Indexes for ultra-fast queries
CREATE INDEX IF NOT EXISTS idx_task_sections_user_id ON public.task_sections(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON public.tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_section_id ON public.tasks(section_id);
CREATE INDEX IF NOT EXISTS idx_tasks_view ON public.tasks(user_id, view);

-- 7. Ensure new columns exist if table was already created
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS due_time TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS subtasks JSONB DEFAULT '[]'::jsonb;

