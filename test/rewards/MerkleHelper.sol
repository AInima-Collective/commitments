// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @notice Builds a merkle root and per-leaf proofs for the
///         (earner, token, cumulativeAmount) leaf shape used by
///         CommitmentsRewardsCoordinator.processClaim. OpenZeppelin's
///         MerkleProof.verifyCalldata sorts pair-hash inputs in ascending
///         order; we mirror that here so generated proofs validate.
library MerkleHelper {
    struct Leaf {
        address earner;
        address token;
        uint256 cumulativeAmount;
    }

    function leafHash(Leaf memory l) internal pure returns (bytes32) {
        return keccak256(abi.encode(l.earner, l.token, l.cumulativeAmount));
    }

    function leafHashAt(Leaf[] memory leaves, uint256 i) internal pure returns (bytes32) {
        return leafHash(leaves[i]);
    }

    function _hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    /// @notice Build the merkle root over `leaves`. Empty input returns 0.
    function buildRoot(Leaf[] memory leaves) internal pure returns (bytes32) {
        uint256 n = leaves.length;
        if (n == 0) return bytes32(0);
        bytes32[] memory layer = new bytes32[](n);
        for (uint256 i = 0; i < n; ++i) {
            layer[i] = leafHash(leaves[i]);
        }
        while (layer.length > 1) {
            uint256 nextLen = (layer.length + 1) / 2;
            bytes32[] memory nextLayer = new bytes32[](nextLen);
            for (uint256 i = 0; i < layer.length; i += 2) {
                if (i + 1 == layer.length) {
                    nextLayer[i / 2] = layer[i];
                } else {
                    nextLayer[i / 2] = _hashPair(layer[i], layer[i + 1]);
                }
            }
            layer = nextLayer;
        }
        return layer[0];
    }

    /// @notice Build a proof for `leaves[idx]` over the same tree.
    function buildProof(Leaf[] memory leaves, uint256 idx) internal pure returns (bytes32[] memory proof) {
        uint256 n = leaves.length;
        require(idx < n, "MerkleHelper: bad idx");
        bytes32[] memory layer = new bytes32[](n);
        for (uint256 i = 0; i < n; ++i) {
            layer[i] = leafHash(leaves[i]);
        }

        // Determine proof length (depth of binary tree, account for odd layers).
        uint256 depth;
        {
            uint256 m = layer.length;
            while (m > 1) {
                depth++;
                m = (m + 1) / 2;
            }
        }
        proof = new bytes32[](depth);
        uint256 proofIdx;
        uint256 cur = idx;
        while (layer.length > 1) {
            uint256 sibling = (cur % 2 == 0) ? cur + 1 : cur - 1;
            // If sibling exists at this layer, include it; else carry-up alone.
            if (sibling < layer.length) {
                proof[proofIdx++] = layer[sibling];
            }
            uint256 nextLen = (layer.length + 1) / 2;
            bytes32[] memory nextLayer = new bytes32[](nextLen);
            for (uint256 i = 0; i < layer.length; i += 2) {
                if (i + 1 == layer.length) {
                    nextLayer[i / 2] = layer[i];
                } else {
                    nextLayer[i / 2] = _hashPair(layer[i], layer[i + 1]);
                }
            }
            layer = nextLayer;
            cur /= 2;
        }
        // Trim trailing zero-length entries when odd-layer carry skipped a slot.
        if (proofIdx < depth) {
            bytes32[] memory trimmed = new bytes32[](proofIdx);
            for (uint256 i = 0; i < proofIdx; ++i) {
                trimmed[i] = proof[i];
            }
            proof = trimmed;
        }
    }
}
