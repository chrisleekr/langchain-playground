const globalSetup = async (): Promise<void> => {
  process.env.TZ = 'UTC';
};

export default globalSetup;
