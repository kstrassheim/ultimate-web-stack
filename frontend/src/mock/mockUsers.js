const meguminAccount = {
    username: "megumin@crimsondemons.com",
    name: "Megumin",
    localAccountId: "explosion-mage-id",
    idTokenClaims: {
      roles: [],
      oid: "explosion-mage-id",
      preferred_username: "megumin@crimsondemons.com",
    },
  };
  
  const aquaAccount = {
    username: "aqua@axisorder.com",
    name: "Aqua",
    localAccountId: "water-goddess-id",
    idTokenClaims: {
      roles: ["Admin"],
      oid: "water-goddess-id",
      preferred_username: "aqua@axisorder.com",
    },
  };
const accounts = [meguminAccount, aquaAccount];
export default accounts;