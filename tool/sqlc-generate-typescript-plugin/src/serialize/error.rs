use std::fmt;

use thiserror::Error;

#[derive(Error, Debug)]
pub enum SerializeError {
    #[error("formatting error")]
    Fmt(#[from] fmt::Error),
    #[error("unknown parameter name at position {index} for query {query}")]
    ParameterNameUnknown { index: usize, query: String },
    #[error("unexpected command <{0}> (allowed: \":one\", \":many\", \":exec\"")]
    UnexpectedCommand(String),
    #[error("unexpected name ")]
    UnexpectedName(#[from] ParseNameError),
}

#[derive(Error, Debug)]
pub enum ParseNameError {
    #[error(
        "unexpected name prefix <{prefix}> in <{name}> (allowed: \"Get\", \"Insert\", \"Update\", \"Delete\")"
    )]
    UnexpectedActionPrefix { name: String, prefix: String },
    #[error(
        "unexpected name <{0}> (examples: \"GetFoo\", \"InsertBar\", \"UpdateBazWithQux\", \"DeleteFooWithBar\")"
    )]
    Malformed(String),
}
