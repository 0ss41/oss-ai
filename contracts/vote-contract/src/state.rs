use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use cosmwasm_std::Addr;
use cw_storage_plus::{Item, Map};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct State {
    pub candidates: Vec<String>,
    pub voted: Vec<Addr>,
    pub owner: Addr,
    pub deadline: u128,
}

pub const STATE: Item<State> = Item::new("state");
pub const VOTES: Map<&str, u64> = Map::new("votes");
