import * as fs from "fs/promises";
import * as fst from "fs";
import * as paths from "path";
import * as process from "child_process";
import { promisify } from "util";

export const StringsToIdentityObject = <T extends string>(strings: ReadonlyArray<T>) => strings.reduce((obj, str) => { obj[str] = str; return obj }, {} as {[P in T]: T});

export const IfDirExists = async (dir: string) => {
  try {
    await fs.access(dir);
    return await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
};

export const CheckExists = async (path: string) => {
  let exists = false;
  try {
    await fs.access(path);
    exists = true;
  } catch {
    
  }
  return exists;
}

export const WriteIfNeeded = async (path: string, content: unknown) => {
  const contentString = typeof content === "string" ? content : JSON.stringify( content, undefined, 2 );

  if (!(await CheckExists(path)) || (await ReadFileContents(path)) !== contentString) {
    const dirName = paths.dirname(path);
    if (!(await CheckExists(dirName))) {
      await fs.mkdir(dirName, {recursive: true});
    }
    await fs.writeFile(path, contentString, "utf-8");
  }
}

export const ReadFileContents = (path: string) => fs.readFile(path, "utf-8");
export const ReadFileContentsAndTrim = async (path: string) => (await ReadFileContents(path)).trim();

export const ReadDirectoriesAsSet = async (dir: string) => [...new Set<string>((await IfDirExists(dir)).filter(e => e.isDirectory()).map(e => e.name))];
export const ReadFilesAsSet = async (dir: string) => [...new Set<string>((await IfDirExists(dir)).filter(e => e.isFile()).map(e => e.name))];

export const ReadFilesAndContents = async (dir: string) => Object.fromEntries( await Promise.all( (await IfDirExists(dir)).filter(e => e.isFile()).map( async e => { const path = `${dir}/${e.name}`; return [path, await fs.readFile(path, "utf-8")] as const;}) ));

export const ReadFilesRecursively = <T> (dir: Parameters<typeof ReadFilesRecursivelyImpl>[0], entryFilter: (prefix: string, entry: Dirent, depth: number) => TEntryFilterResult<T>) => ReadFilesRecursivelyImpl(dir, entryFilter, 0, "");

export type TEntryFilterResult<T> = { action: "stop" | "recurse" } | { action: "include", result: T | Promise<T> };

export type Dirent = fst.Dirent;

export const stat = fs.stat;
export const mkdir = fs.mkdir;

const ReadFilesRecursivelyImpl: <T> (dir: string, entryFilter: (prefix: string, entry: Dirent, depth: number) => TEntryFilterResult<T>, depth: number, prefix: string) => Promise<Array<T>> = async (dir, entryFilter, depth, prefix) => (await Promise.all((await IfDirExists(dir))/*.filter(e => e.isDirectory() || entryFilter(e, depth))*/.map(async (e) => {
  const filterResult = entryFilter(prefix, e, depth);
  switch (filterResult.action) {
    case "stop":
      return [];
    case "recurse":
      return [...(await ReadFilesRecursivelyImpl(`${dir}/${e.name}`, entryFilter, depth + 1, WithPrefix(`${e.name}/`, prefix)))];
    case "include":
      const maybePromise = filterResult.result;
      return [maybePromise instanceof Promise ? await maybePromise : maybePromise];
    default:
      throw new Error(`Unrecognized action"${(filterResult as any).action}"`);
  }
}))).reduce((prev, cur) => { prev.push(...cur); return prev }, []);
const WithPrefix = (content: string, prefix: string) => `${prefix}${content}`;

// TODO instead of TrimCustomEnd, maybe use Node's path module's stuff, altho normalize() does state in its documentation that trailing slashes are preserved...
export const CopyDirectory: (input: { src: string, dst: string, includeEntry?: ((entry: Dirent, srcPath: string, dstPath: string) => boolean) | undefined, afterFileCopy?: ((srcFile: string, dstFile: string) => Promise<unknown>) | undefined }) => Promise<void> = async (input) => CopyDirectoryWithState({ src: TrimCustomEnd(input.src, '/'), dst: TrimCustomEnd(input.dst, '/'), includeEntry: input.includeEntry ?? (() => true), afterFileCopy: input.afterFileCopy }, { originalDst: input.dst, dirState: {} });

export const CopyDirectoryPreserveTimestamps = (input: {src: string, dst: string, includeEntry?: ((entry: Dirent, srcPath: string, dstPath: string) => boolean) | undefined }) => CopyDirectory({...input, afterFileCopy: async (srcFile, dstFile) => { const stats = await fs.stat(srcFile); await fs.utimes( dstFile, stats.atime, stats.mtime ); }});

const CopyDirectoryWithState: (input: { src: string, dst: string, includeEntry: (entry: Dirent, srcPath: string, dstPath: string) => boolean, afterFileCopy: ((srcFile: string, dstFile: string) => Promise<unknown>) | undefined }, state: Readonly<{originalDst: string, dirState: {[k: string]: string} }>) => Promise<void> = async (input, state) => {
  const {src, dst, includeEntry, afterFileCopy} = input;

  const {originalDst, dirState} = state;
  await Promise.all([...
    (await fs.readdir(src, { withFileTypes: true }))
    .map(async (e) => {
      const curSrc = `${src}/${e.name}`;
      const curDst = `${dst}/${e.name}`;
      if (includeEntry(e, curSrc, curDst)) {
        if (e.isDirectory()) {
          await CopyDirectoryWithState({ src: curSrc, dst: curDst, includeEntry, afterFileCopy }, state);
        } else if (e.isFile()) {
          if (dirState[dst] === undefined) {
            if (!(await CheckExists(dst))) {
              await fs.mkdir(dst, {recursive: true});
            }
            let cur = dst;
            do {
              dirState[cur] = cur;
              cur = paths.dirname(cur);
            } while (cur !== originalDst && dirState[cur] === undefined);
          }
          await fs.copyFile(curSrc, curDst);
          if (afterFileCopy) {
            await afterFileCopy(curSrc, curDst);
          }
        }
      }
    })]);
}

 
export const ExecProcess = promisify(process.execFile); // I guess 512k of buffer size is ok for us

export const ExecProcessAndLog = async (path: string, args: string[], workingDir: string | undefined = undefined) => { // We have to use string[] instead of ReadonlyArray<string> because how promisify namespace is defined in child_process.ts
  try {
    const {stdout, stderr } = await ExecProcess(path, args, workingDir && workingDir.length > 0 ? { cwd: workingDir } : undefined );
    console.log(stdout);
    if (stderr.length > 0) {
      console.error(stderr);
    } 
  } catch (e) {
    console.error(e);
  }
}


// Adapted from https://stackoverflow.com/questions/26156292/trim-specific-character-from-a-string , Jason Larke's answer (all the other answers are garbage)
export const TrimCustomEnd = (str: string, ch: string) => {
  // let start = 0;
  let end = str.length;

  // while(start < end && str[start] === ch) {
  //   ++start;
  // }

  while(end > 0 && str[end - 1] === ch) {
    --end;
  }

  return end < str.length ? str.substring(0, end) : str;
}