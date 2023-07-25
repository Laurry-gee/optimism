package test

import (
	"testing"

	"github.com/ethereum-optimism/optimism/op-challenger/fault/alphabet"
)

func NewAlphabetWithProofProvider(t *testing.T, maxDepth int, oracleError error) *alphabetWithProofProvider {
	return &alphabetWithProofProvider{
		alphabet.NewAlphabetProvider("abcdefghijklmnopqrstuvwxyz", uint64(maxDepth)),
		oracleError,
	}
}

func NewAlphabetClaimBuilder(t *testing.T, maxDepth int) *ClaimBuilder {
	alphabetProvider := NewAlphabetWithProofProvider(t, maxDepth, nil)
	return NewClaimBuilder(t, maxDepth, alphabetProvider)
}

type alphabetWithProofProvider struct {
	*alphabet.AlphabetProvider
	OracleError error
}

func (a *alphabetWithProofProvider) GetPreimage(i uint64) ([]byte, []byte, error) {
	preimage, _, err := a.AlphabetProvider.GetPreimage(i)
	if err != nil {
		return nil, nil, err
	}
	return preimage, []byte{byte(i)}, nil
}

func (a *alphabetWithProofProvider) GetOracleData(i uint64) ([]byte, []byte, error) {
	if a.OracleError != nil {
		return nil, nil, a.OracleError
	}
	return []byte{byte(i)}, []byte{byte(i)}, nil
}
