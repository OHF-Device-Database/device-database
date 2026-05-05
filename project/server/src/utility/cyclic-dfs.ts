/**
 * detects all nodes that participate in a cycle within a directed graph
 *
 * @param graph - map from each node to its neighbours
 * @returns a `Set` of every node that lies on at least one cycle
 */
export const cyclicNodes = <T>(graph: Map<T, Iterable<T>>): Set<T> => {
	const cyclic = new Set<T>();
	const visited = new Set<T>();
	const inStack = new Set<T>();

	// returns the cycle-root node if a cycle is open, or null when fully resolved
	const visit = (node: T): T | null => {
		if (inStack.has(node)) {
			cyclic.add(node);
			// node is the cycle root
			return node;
		}
		if (visited.has(node)) {
			return null;
		}

		visited.add(node);
		inStack.add(node);

		for (const neighbour of graph.get(node) ?? []) {
			const root = visit(neighbour);
			if (root !== null) {
				cyclic.add(node);
				inStack.delete(node);
				// keep propagating until we unwind back to the root itself
				return root === node ? null : root;
			}
		}

		inStack.delete(node);
		return null;
	};

	for (const node of graph.keys()) {
		visit(node);
	}

	return cyclic;
};
