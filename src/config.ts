
class Config {
  dbFileName: string = mustGetEnv('DB_FILE_NAME');
}

function mustGetEnv(name: string) {
  if (!process.env[name]) {
    throw new Error(`${name} not found`)
  }

  return process.env[name];
}
