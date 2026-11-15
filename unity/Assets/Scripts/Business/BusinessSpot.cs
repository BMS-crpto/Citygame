using UnityEngine;

namespace Citygame.Business
{
    public sealed class BusinessSpot : MonoBehaviour
    {
        [SerializeField] private string businessName = "Lagos Business";
        [SerializeField] private BusinessCategory category = BusinessCategory.Restaurant;

        public string BusinessName => businessName;
        public BusinessCategory Category => category;

        public void Configure(string name, BusinessCategory type)
        {
            businessName = name;
            category = type;
        }
    }
}
