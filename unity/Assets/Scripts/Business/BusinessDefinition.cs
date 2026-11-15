using UnityEngine;

namespace Citygame.Business
{
    public enum BusinessCategory
    {
        Barbershop,
        FashionStore,
        Restaurant,
        Supermarket,
        Lounge,
        CarWash,
        Pharmacy,
        Technology
    }

    [CreateAssetMenu(menuName = "Citygame/Business Definition", fileName = "BusinessDefinition")]
    public sealed class BusinessDefinition : ScriptableObject
    {
        [SerializeField] private string displayName = "New Lagos Business";
        [SerializeField] private BusinessCategory category;
        [SerializeField, Min(0)] private long registrationCost = 150000;
        [SerializeField, Min(0)] private int maximumStaff = 10;

        public string DisplayName => displayName;
        public BusinessCategory Category => category;
        public long RegistrationCost => registrationCost;
        public int MaximumStaff => maximumStaff;
    }
}
