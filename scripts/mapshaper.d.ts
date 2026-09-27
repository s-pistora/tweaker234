declare module 'mapshaper' {
  const mapshaper: {
    applyCommands(cmd: string, input?: Record<string, string | Buffer>): Promise<Record<string, Buffer | string>>;
    runCommands(cmd: string): Promise<void>;
  };
  export default mapshaper;
}
