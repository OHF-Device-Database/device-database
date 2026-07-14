/**
 * detects all nodes that participate in a cycle within a directed graph
 *
 * @param graph - map from each node to its neighbors
 * @returns a `Set` of every node that lies on at least one cycle
 */
export const cyclicNodes = <T>(graph: Map<T, Iterable<T>>): Set<T> => {
	const cyclic = new Set<T>();
	const visited = new Set<T>();
	const inStack = new Set<T>();

	type Frame = {
		node: T;
		neighbors: Iterator<T>;
		/** cycle-root being propagated back up, or `null` when none */
		pendingRoot: T | null;
	};

	for (const startNode of graph.keys()) {
		if (visited.has(startNode)) {
			continue;
		}

		const stack: Frame[] = [];

		const push = (node: T) => {
			visited.add(node);
			inStack.add(node);
			const neighbors = (graph.get(node) ?? [])[Symbol.iterator]();
			stack.push({ node, neighbors: neighbors, pendingRoot: null });
		};

		push(startNode);

		while (stack.length > 0) {
			const frame = stack[stack.length - 1];

			// returning from a child → handle the propagated root
			if (frame.pendingRoot !== null) {
				const root = frame.pendingRoot;
				frame.pendingRoot = null;

				cyclic.add(frame.node);

				if (root === frame.node) {
					// unwound back to the cycle root → stop propagating
					inStack.delete(frame.node);
					stack.pop();
				} else {
					// keep propagating upward → skip remaining neighbors
					inStack.delete(frame.node);
					stack.pop();
					if (stack.length > 0) {
						stack[stack.length - 1].pendingRoot = root;
					}
				}
				continue;
			}

			// advance to the next neighbor
			const { value: neighbor, done } = frame.neighbors.next();

			if (done) {
				// all neighbors exhausted with no cycle through this node
				inStack.delete(frame.node);
				stack.pop();
				continue;
			}

			if (inStack.has(neighbor)) {
				// back-edge found → neighbor is the cycle root
				cyclic.add(neighbor);
				cyclic.add(frame.node);
				inStack.delete(frame.node);
				stack.pop();

				if (stack.length > 0) {
					stack[stack.length - 1].pendingRoot =
						neighbor === frame.node ? null : neighbor;
				}

				continue;
			}

			if (visited.has(neighbor)) {
				// already fully explored, no cycle this way
				continue;
			}

			push(neighbor);
		}
	}

	return cyclic;
};
