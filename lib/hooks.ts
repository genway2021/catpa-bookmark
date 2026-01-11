import { useState, useEffect, useCallback, useRef } from "react";
import { DataSchema, DEFAULT_DATA, Category, Todo, Note } from "./types";
import { GITHUB_CONFIG_KEY, GithubConfig, loadDataFromGithub, saveDataToGithub } from "./github";
import { toast } from "sonner";

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(initialValue);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item) {
        setStoredValue(JSON.parse(item));
      }
      setInitialized(true);
    } catch (error) {
      console.error(error);
      setInitialized(true);
    }
  }, [key]);

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (error) {
      console.error(error);
    }
  };

  return [storedValue, setValue, initialized] as const;
}

export function useWallpaper(initialWallpapers: string[], initialData: DataSchema) {
  const getInitialWallpaper = useCallback((data: DataSchema): string => {
    if (data.settings.wallpaperType === 'local' && initialWallpapers.length > 0) {
      return initialWallpapers[0];
    }
    if (data.settings.wallpaperType !== 'local' && data.settings.wallpaper) {
        return data.settings.wallpaper;
    }
    return "";
  }, [initialWallpapers]);

  const [currentWallpaper, setCurrentWallpaper] = useState(() => getInitialWallpaper(initialData));
  const [imgLoaded, setImgLoaded] = useState(true);

  const initWallpaper = useCallback(async (cfg: DataSchema) => {
    const { wallpaperType, wallpaper, wallpaperList } = cfg.settings;
    if (wallpaperType === 'local') {
      const list = (initialWallpapers.length > 0) ? initialWallpapers : wallpaperList;
      if (list && list.length > 0) {
        const randomImg = list[Math.floor(Math.random() * list.length)];
        setCurrentWallpaper(randomImg);
      }
    } else if (wallpaperType === 'bing') {
      setCurrentWallpaper(`https://bing.img.run/1920x1080.php?t=${new Date().getTime()}`);
    } else {
      setCurrentWallpaper(wallpaper);
    }
  }, [initialWallpapers]);

  useEffect(() => {
    if (!currentWallpaper) return;
    if (initialWallpapers.includes(currentWallpaper)) {
      setImgLoaded(true);
      return;
    }
    setImgLoaded(false);
    const img = new Image();
    img.src = currentWallpaper;
    img.onload = () => setImgLoaded(true);
  }, [currentWallpaper, initialWallpapers]);

  return { currentWallpaper, imgLoaded, initWallpaper, setCurrentWallpaper };
}

const LOCAL_DATA_KEY = "clean-nav-local-data";

export function useNavData(initialWallpapers: string[]) {
  const [isReady, setIsReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [data, setData] = useState<DataSchema>(() => {
    const dataCopy = JSON.parse(JSON.stringify(DEFAULT_DATA));
    if (initialWallpapers.length > 0) {
      dataCopy.settings.wallpaperList = [...initialWallpapers];
    }
    return dataCopy;
  });

  // Use a ref to track the latest data for the effect
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const updateLocalAndState = useCallback((newData: DataSchema) => {
    setData(newData);
    setHasUnsavedChanges(true);
    if (typeof window !== 'undefined') {
      localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(newData));
    }
  }, []);

  useEffect(() => {
    async function initData() {
      try {
        let currentData = dataRef.current;
        let loadedFromStorage = false;

        if (typeof window !== 'undefined') {
          const localDataString = localStorage.getItem(LOCAL_DATA_KEY);
          if (localDataString) {
            try {
              const localData = JSON.parse(localDataString) as DataSchema;
              if (initialWallpapers.length > 0) {
                if (!localData.settings.wallpaperList || localData.settings.wallpaperList.length === 0) {
                  localData.settings.wallpaperList = [...initialWallpapers];
                }
              }
              currentData = localData;
              setData(localData);
              loadedFromStorage = true;
            } catch (e) {
              console.error("Failed to parse local data", e);
            }
          }
        }

        setIsReady(true);

        const storedConfig = localStorage.getItem(GITHUB_CONFIG_KEY);
        if (storedConfig) {
          const config: GithubConfig = JSON.parse(storedConfig);
          if (config.token) {
            loadDataFromGithub(config).then(ghData => {
              if (ghData) {
                const localTodos = currentData.todos || [];
                const localNotes = currentData.notes || [];
                const mergedTodos = (ghData.todos && ghData.todos.length > 0) ? ghData.todos : localTodos;
                const mergedNotes = (ghData.notes && ghData.notes.length > 0) ? ghData.notes : localNotes;
                const finalData = { ...ghData, todos: mergedTodos, notes: mergedNotes };

                if (JSON.stringify(finalData) !== JSON.stringify(currentData)) {
                  if (initialWallpapers.length > 0) {
                    finalData.settings.wallpaperList = [...initialWallpapers];
                  }
                  setData(finalData);
                  if (typeof window !== 'undefined') {
                    localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(finalData));
                  }

                  const isDifferent =
                    JSON.stringify(mergedTodos) !== JSON.stringify(ghData.todos) ||
                    JSON.stringify(mergedNotes) !== JSON.stringify(ghData.notes);

                  if (isDifferent) {
                    setHasUnsavedChanges(true);
                    toast.info("有设置未同步，点击提交到github");
                  }
                }
              }
            });
          }
        }

        if (!loadedFromStorage && !storedConfig) {
          try {
            const res = await fetch("/data.json");
            if (res.ok) {
              const fetchedData = await res.json();
              const finalData = { ...fetchedData, todos: [], notes: [] };
              if (initialWallpapers.length > 0) finalData.settings.wallpaperList = [...initialWallpapers];
              setData(finalData);
            }
          } catch (e) {
            console.log("No deployed data.json found.");
          }
        }
      } catch (err) {
        console.error("Initialization error", err);
        setIsReady(true);
      }
    }

    initData();
  }, [initialWallpapers]);

  const handleSave = async (newData: DataSchema, onWallpaperUpdate?: (cfg: DataSchema) => void) => {
    setSaving(true);
    try {
      const oldData = data;
      setData(newData);
      if (typeof window !== 'undefined') {
        localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(newData));
        setHasUnsavedChanges(true);
      }
      
      if (onWallpaperUpdate && (newData.settings.wallpaperType !== oldData.settings.wallpaperType || newData.settings.wallpaper !== oldData.settings.wallpaper)) {
        onWallpaperUpdate(newData);
      }

      const storedConfig = localStorage.getItem(GITHUB_CONFIG_KEY);
      if (!storedConfig) {
        toast.success("本地已更新 (未同步 GitHub)");
        setSaving(false);
        return;
      }
      const config: GithubConfig = JSON.parse(storedConfig);
      if (!config.token) {
        toast.success("本地已更新 (未同步 GitHub)");
        setSaving(false);
        return;
      }
      const success = await saveDataToGithub(config, newData);
      if (success) {
        toast.success("同步成功！");
        setHasUnsavedChanges(false);
      } else {
        toast.error("同步失败 (已暂存到本地)");
      }
    } catch (error) {
      console.error(error);
      toast.error("保存时发生错误");
    } finally {
      setSaving(false);
    }
  };

  const handleReorder = (newCategories: Category[]) => {
    updateLocalAndState({ ...data, categories: newCategories });
  };
  const handleTodosUpdate = (newTodos: Todo[]) => {
    updateLocalAndState({ ...data, todos: newTodos });
  };
  const handleNotesUpdate = (newNotes: Note[]) => {
    updateLocalAndState({ ...data, notes: newNotes });
  };

  return {
    data,
    isReady,
    saving,
    hasUnsavedChanges,
    handleSave,
    handleReorder,
    handleTodosUpdate,
    handleNotesUpdate,
    setData
  };
}
