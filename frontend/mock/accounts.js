const mayuri = {
  username: "shiina.mayuri@futuregadgetlab.org",
  name: "Mayuri Shiina",
  localAccountId: "mayushii-id",
  idTokenClaims: {
    roles: [],
    oid: "mayushii-id",
    preferred_username: "mayushii@futuregadgetlab.org",
    nickname: "Mayushii"
  },
};

const okabe = {
  username: "okabe.rintaro@futuregadgetlab.org",
  name: "Rintaro Okabe",
  localAccountId: "mad-scientist-id",
  idTokenClaims: {
    roles: ["Admin"],
    oid: "mad-scientist-id",
    preferred_username: "hououin.kyouma@futuregadgetlab.org",
    nickname: "Hououin Kyouma"
  },
};

const kurisu = {
  username: "makise.kurisu@futuregadgetlab.org",
  name: "Kurisu Makise",
  localAccountId: "christina-id",
  idTokenClaims: {
    roles: ["Admin"],
    oid: "christina-id",
    preferred_username: "christina@futuregadgetlab.org",
    nickname: "Christina"
  },
};

const titor = {
  username: "amane.suzuha@futuregadgetlab.org",
  name: "Suzuha Amane",
  localAccountId: "john-titor-id",
  idTokenClaims: {
    roles: [],
    oid: "john-titor-id",
    preferred_username: "john.titor@futuregadgetlab.org",
    nickname: "John Titor"
  },
};

const daru = {
  username: "hashida.itaru@futuregadgetlab.org",
  name: "Itaru Hashida",
  localAccountId: "super-hacker-id",
  idTokenClaims: {
    roles: ["Admin"],
    oid: "super-hacker-id",
    preferred_username: "daru@futuregadgetlab.org",
    nickname: "Daru"
  },
};



const accounts = [mayuri, okabe, kurisu, titor, daru];
export default accounts;