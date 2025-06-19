declare module 'electron-store' {
  export interface Options<T> {
    defaults?: Partial<T>;
    name?: string;
    cwd?: string;
    encryptionKey?: string | Buffer;
    fileExtension?: string;
    clearInvalidConfig?: boolean;
    serialize?: (value: T) => string;
    deserialize?: (text: string) => T;
    projectName?: string;
    projectVersion?: string;
    migrations?: Record<string, (store: Store<T>) => void>;
    schema?: any;
    watch?: boolean;
  }

  export default class Store<T = any> {
    constructor(options?: Options<T>);
    
    store: T;
    size: number;
    path: string;
    
    get<K extends keyof T>(key: K): T[K];
    get<K extends keyof T>(key: K, defaultValue: T[K]): T[K];
    
    set<K extends keyof T>(key: K, value: T[K]): void;
    set(object: Partial<T>): void;
    
    has(key: keyof T): boolean;
    
    delete(key: keyof T): void;
    
    clear(): void;
    
    onDidChange<K extends keyof T>(
      key: K,
      callback: (newValue?: T[K], oldValue?: T[K]) => void
    ): () => void;
    
    onDidAnyChange(
      callback: (newValue?: T, oldValue?: T) => void
    ): () => void;
  }
}