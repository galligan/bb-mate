import type {
  NativeInventoryObservation,
  NativeInventoryTransitionFacts,
} from "./native-inventory-types.ts";

const issuedObservations = new WeakMap<
  object,
  NativeInventoryTransitionFacts
>();
const consumedObservations = new WeakSet<object>();
const activeTransitions = new WeakMap<object, NativeInventoryTransitionFacts>();

export function issueNativeInventoryObservation(
  input: NativeInventoryTransitionFacts,
): NativeInventoryObservation {
  const facts = freezeFacts(input);
  const observation = { observedAt: facts.observedAt };
  Object.defineProperty(observation, "toJSON", {
    enumerable: false,
    value: () => {
      throw new TypeError("native inventory observations are server-private");
    },
  });
  Object.freeze(observation);
  issuedObservations.set(observation, facts);
  return observation;
}

export async function consumeIssuedNativeInventory<T>(
  observation: unknown,
  consumer: (transition: unknown) => T | Promise<T>,
): Promise<T> {
  if (typeof observation !== "object" || observation === null) {
    throw notIssued();
  }
  const facts = issuedObservations.get(observation);
  if (!facts || consumedObservations.has(observation)) throw notIssued();
  consumedObservations.add(observation);
  const transition = createTransition();
  activeTransitions.set(transition, facts);
  try {
    return await consumer(transition);
  } finally {
    activeTransitions.delete(transition);
  }
}

export function readNativeInventoryTransition(
  transition: unknown,
): Readonly<NativeInventoryTransitionFacts> {
  if (typeof transition !== "object" || transition === null) {
    throw transitionNotActive();
  }
  const facts = activeTransitions.get(transition);
  if (!facts) throw transitionNotActive();
  return facts;
}

function freezeFacts(
  facts: NativeInventoryTransitionFacts,
): NativeInventoryTransitionFacts {
  return Object.freeze({
    ...facts,
    entries: Object.freeze([...facts.entries]),
    malformedRows: Object.freeze([...facts.malformedRows]),
  });
}

function createTransition(): object {
  const transition = {};
  Object.defineProperty(transition, "toJSON", {
    enumerable: false,
    value: () => {
      throw new TypeError("native inventory transitions are server-private");
    },
  });
  return Object.freeze(transition);
}

function notIssued(): TypeError {
  return new TypeError(
    "native inventory observation was not issued by inspection",
  );
}

function transitionNotActive(): TypeError {
  return new TypeError("native inventory transition is not active");
}
