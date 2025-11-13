use std::collections::HashMap;
use std::fmt;
use std::fmt::Write as _;
use std::io;
use std::io::Read;
use std::io::Write as _;
use std::str::Utf8Error;

use miniserde::{Deserialize, json};
use prost::Message;
use thiserror::Error;

mod serialize;
mod sqlc;

use sqlc::plugin::{File, GenerateRequest, GenerateResponse, Query};

use serialize::{SerializeError, serialize};

#[derive(Error, Debug)]
pub enum Error {
    #[error("protocol buffer decoding failed")]
    Decode(#[from] prost::DecodeError),
    #[error("faulty plugin settings encoding")]
    Encoding(#[from] Utf8Error),
    #[error("malformed plugin settings")]
    Malformed(#[from] miniserde::Error),
    #[error("i/o error")]
    Io(#[from] io::Error),
    #[error("formatting error")]
    Fmt(#[from] fmt::Error),
    #[error("serialization error")]
    Serialize(#[from] SerializeError),
}

#[derive(Deserialize, Debug)]
struct Options {
    types_path: String,
}

fn main() -> Result<(), Error> {
    let mut stdin = io::stdin().lock();
    let mut buffer: Vec<u8> = Vec::new();
    stdin.read_to_end(&mut buffer).unwrap();

    let request = GenerateRequest::decode(buffer.as_slice()).map_err(Error::from)?;
    let mut mapped: HashMap<String, Vec<Query>> = HashMap::new();
    for query in request.queries {
        let key = query.filename.to_string();
        let bucket = mapped.get_mut(&key);
        if let Some(inner) = bucket {
            inner.push(query);
        } else {
            mapped.insert(key, vec![query]);
        }
    }

    let cast = str::from_utf8(&request.plugin_options)?;
    let options: Options = json::from_str(cast)?;

    let preamble = format!(
        "import type {{ BoundQuery, Query }} from \"{}\"\n\n",
        options.types_path
    );

    let mut response = GenerateResponse::default();

    for (file_name, queries) in mapped {
        let mut buf = preamble.to_string();

        for query in queries {
            let serialized = serialize(query).map_err(Error::from)?;
            writeln!(&mut buf, "{}", serialized)?;
        }

        let file = File {
            name: format!(
                "{}.ts",
                file_name.strip_suffix(".sql").unwrap_or(file_name.as_str())
            ),
            contents: buf.into_bytes(),
        };

        response.files.push(file);
    }

    io::stdout()
        .write_all(&response.encode_to_vec())
        .map_err(Error::from)?;

    Ok(())
}
