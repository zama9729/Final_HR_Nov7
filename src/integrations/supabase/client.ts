// SUPABASE REMOVED - Using PostgreSQL + Express API instead
// DO NOT USE THIS - Use api from @/lib/api instead

// This stub allows imports but throws errors when methods are actually called
// This lets the app load so we can see which components need updating

console.warn(
  '⚠️ Supabase has been removed! ' +
  'Components should use api from "@/lib/api" instead. ' +
  'This stub will throw errors when Supabase methods are called.'
);

const createError = (method: string) => () => {
  console.error(`Supabase.${method} was called. Component needs to use API instead.`);
  throw new Error(
    `Supabase removed! Component tried to use ${method}. ` +
    `Please use the API client from "@/lib/api" instead. ` +
    `Check browser console stack trace to find which component needs updating.`
  );
};

// Export a stub object that throws on any method call
export const supabase = {
  auth: {
    getUser: createError('auth.getUser'),
    getSession: createError('auth.getSession'),
    signInWithPassword: createError('auth.signInWithPassword'),
    signUp: createError('auth.signUp'),
    signOut: createError('auth.signOut'),
    updateUser: createError('auth.updateUser'),
    onAuthStateChange: () => ({ 
      data: { 
        subscription: { 
          unsubscribe: () => {} 
        } 
      } 
    }),
  },
  from: (table: string) => {
    console.warn(`supabase.from('${table}') called - component needs to use API instead`);
    return {
      select: (query?: string) => ({
        eq: (column: string, value: any) => ({
          single: () => Promise.reject(new Error(`Supabase removed. Use api from @/lib/api to fetch from ${table}`)),
          order: () => Promise.reject(new Error(`Supabase removed. Use api from @/lib/api to fetch from ${table}`)),
        }),
        in: (column: string, values: any[]) => ({
          order: (column: string, options?: any) => Promise.reject(new Error(`Supabase removed. Use api from @/lib/api to fetch from ${table}`)),
        }),
        order: (column: string, options?: any) => ({
          limit: (count: number) => Promise.reject(new Error(`Supabase removed. Use api from @/lib/api to fetch from ${table}`)),
        }),
      }),
      insert: (data: any) => Promise.reject(new Error(`Supabase removed. Use api from @/lib/api to insert into ${table}`)),
      update: (data: any) => ({
        eq: (column: string, value: any) => Promise.reject(new Error(`Supabase removed. Use api from @/lib/api to update ${table}`)),
      }),
      delete: () => Promise.reject(new Error(`Supabase removed. Use api from @/lib/api to delete from ${table}`)),
    };
  },
  functions: {
    invoke: (name: string) => {
      console.warn(`supabase.functions.invoke('${name}') called - component needs to use API instead`);
      return Promise.reject(new Error(`Supabase removed. Use api from @/lib/api instead of function '${name}'`));
    },
  },
  storage: {
    from: (bucket: string) => ({
      upload: () => Promise.reject(new Error(`Supabase storage removed. Use API file upload for bucket '${bucket}'`)),
      getPublicUrl: (path: string) => ({ data: { publicUrl: '' } }),
    }),
  },
  channel: (name: string) => {
    console.warn(`supabase.channel('${name}') called - realtime removed, using polling instead`);
    return {
      on: () => ({
        on: () => ({
          subscribe: () => ({ unsubscribe: () => {} }),
        }),
      }),
      subscribe: () => ({ unsubscribe: () => {} }),
    };
  },
  removeChannel: () => {},
} as any;
