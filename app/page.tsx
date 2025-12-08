import fs from 'fs';
import path from 'path';
import HomeClient from '@/components/home-client';


const MAX_WALLPAPERS = 10; 

export default function Page() {
  let wallpapersBase64: string[] = [];

  try {
    const wallpaperDir = path.join(process.cwd(), 'public/wallpapers');
    
    if (fs.existsSync(wallpaperDir)) {
      const files = fs.readdirSync(wallpaperDir);
      const imageFiles = files.filter(file => 
        ['.jpg', '.jpeg', '.png', '.webp', '.svg'].includes(path.extname(file).toLowerCase())
      );

      const shuffled = imageFiles.sort(() => 0.5 - Math.random());
      const selected = shuffled.slice(0, MAX_WALLPAPERS);

      wallpapersBase64 = selected.map(file => {
        const filePath = path.join(wallpaperDir, file);
        const fileBuffer = fs.readFileSync(filePath);
        const ext = path.extname(file).toLowerCase().replace('.', '');
        const mimeType = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
        return `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
      });
      
      console.log(`[Build] 已自动打包 ${wallpapersBase64.length} 张壁纸`);
    }
  } catch (error) {
    console.error('[Build] 读取壁纸失败:', error);
  }

  return <HomeClient initialWallpapers={wallpapersBase64} />;
}