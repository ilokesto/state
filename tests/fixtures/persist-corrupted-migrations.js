/** @param {unknown} state */
const identity = (state) => state;

export const sparseMigrations = [identity];
sparseMigrations.length = 2;

export const nonFunctionMigrations = [identity];
Reflect.set(nonFunctionMigrations, 1, null);
nonFunctionMigrations.length = 2;
