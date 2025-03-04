use cosmwasm_std::StdError;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    #[error("Unauthorized")]
    Unauthorized {},

    #[error("Voter already voted")]
    AlreadyVoted {},

    #[error("Candidate not found in the candidates list")]
    CandidateNotFound {},
}
