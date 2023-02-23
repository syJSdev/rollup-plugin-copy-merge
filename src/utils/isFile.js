import fs from 'fs-extra';

export default async function isFile(filePath) {
  const fileStats = await fs.stat(filePath);

  return fileStats.isFile();
}
