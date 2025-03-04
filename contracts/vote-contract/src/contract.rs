#[cfg(not(feature = "library"))]
use cosmwasm_std::entry_point;
use cosmwasm_std::{
    to_json_binary, Addr, Binary, Deps, DepsMut, Env, Event, MessageInfo, Order, Response,
    StdResult,
};
use cw2::set_contract_version;

use crate::error::ContractError;
use crate::msg::{ExecuteMsg, InstantiateMsg, QueryMsg, VotesResponse};
use crate::state::{State, STATE, VOTES};

// version info for migration info
const CONTRACT_NAME: &str = "crates.io:vote-contract";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    let state = State {
        candidates: msg.candidates.clone(),
        voted: vec![],
        owner: info.sender.clone(),
        deadline: msg.deadline,
    };

    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;

    STATE.save(deps.storage, &state)?;

    let candidates = format!("{:?}", msg.candidates);

    for candidate in msg.candidates {
        VOTES.save(deps.storage, &candidate, &0)?;
    }

    Ok(Response::new()
        .add_attribute("method", "instantiate")
        .add_attribute("owner", info.sender)
        .add_attribute("candidates", candidates))
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn execute(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::Vote { candidate } => try_vote(deps, info, candidate),
    }
}

fn has_voted(voter: &Addr, state: &State) -> bool {
    state.voted.iter().any(|i| i == voter)
}

fn is_candidate(candidate: &str, state: &State) -> bool {
    state.candidates.iter().any(|i| i == candidate)
}

pub fn try_vote(
    deps: DepsMut,
    info: MessageInfo,
    candidate: String,
) -> Result<Response, ContractError> {
    let state = STATE.load(deps.storage)?;

    if has_voted(&info.sender, &state) {
        return Err(ContractError::AlreadyVoted {});
    }

    if is_candidate(&candidate, &state) == false {
        return Err(ContractError::CandidateNotFound {});
    }

    let mut votes = VOTES.load(deps.storage, &candidate)?;

    votes += 1;

    VOTES.save(deps.storage, &candidate, &votes)?;

    STATE.update(deps.storage, |mut state| -> Result<_, ContractError> {
        state.voted.push(info.sender);
        Ok(state)
    })?;

    let voted_event = Event::new("voted");

    Ok(Response::new()
        .add_attribute("method", "try_vote")
        .add_event(voted_event))
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::GetVotes {} => to_json_binary(&query_votes(deps)?),
    }
}

fn query_votes(deps: Deps) -> StdResult<VotesResponse> {
    Ok(VotesResponse {
        0: VOTES
            .range(deps.storage, None, None, Order::Ascending)
            .collect::<Result<_, _>>()
            .unwrap(),
    })
}
