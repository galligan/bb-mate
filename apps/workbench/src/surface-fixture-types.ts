export interface ProductFixture<
  State extends object,
  Interaction extends object,
> {
  id: string;
  name: string;
  description: string;
  state: State;
  interactions: readonly Interaction[];
}

export interface FixtureInteraction {
  id: string;
  outcome: string;
  [key: string]: unknown;
}
